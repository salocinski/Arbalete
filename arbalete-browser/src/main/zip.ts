import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { crc32, inflateRawSync } from 'node:zlib'

// Extraction d'une archive zip hostile (ARB-161, EP-04), sans dépendance : lit le répertoire central, refuse tout ce qui
// sort du dossier de destination (chemin absolu, « .. », lecteur, antislash, nom réservé de Windows), les liens symboliques,
// le chiffrement, zip64 et les méthodes autres que stockée / deflate, borne le nombre de fichiers, la profondeur et la taille
// totale (annoncée ET réellement décompressée), et vérifie le CRC-32 de chaque fichier.
// shortcut: pas de zip64 (une extension de plus de 4 Go est hors limite de toute façon), pas de ZIP multi-disques.

export type LimitesZip = { octets: number; fichiers: number; profondeur: number }

type Entree = {
  segments: string[]
  dossier: boolean
  methode: number
  crc: number
  comprime: number
  taille: number
  local: number
}

function segmentsSurs(nom: string): string[] {
  const controle = [...nom].some((c) => c.charCodeAt(0) < 32)
  if (nom.length === 0 || nom.length > 512 || controle || /[\\<>:"|?*]/.test(nom) || nom.startsWith('/'))
    throw new Error('Chemin refusé dans l’archive')
  const segments = nom.split('/')
  if (segments.at(-1) === '') segments.pop()
  if (segments.length === 0) throw new Error('Chemin refusé dans l’archive')
  for (const s of segments) {
    if (
      s === '' ||
      s === '.' ||
      s === '..' ||
      /[. ]$/.test(s) ||
      /^(con|prn|aux|nul|com\d|lpt\d|conin\$|conout\$|clock\$)(\..*)?$/i.test(s)
    )
      throw new Error('Chemin refusé dans l’archive')
  }
  return segments
}

function lireRepertoire(zip: Buffer, lim: LimitesZip): { entrees: Entree[]; debutRepertoire: number } {
  let eocd = -1
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('Archive invalide')
  const total = zip.readUInt16LE(eocd + 10)
  const tailleRepertoire = zip.readUInt32LE(eocd + 12)
  const debut = zip.readUInt32LE(eocd + 16)
  if (total === 0xffff || tailleRepertoire === 0xffffffff || debut === 0xffffffff)
    throw new Error('Archive zip64 refusée')
  if (total > lim.fichiers) throw new Error('Extension trop volumineuse')
  if (debut + tailleRepertoire > eocd) throw new Error('Archive invalide')
  const entrees: Entree[] = []
  const vus = new Set<string>()
  let somme = 0
  let pos = debut
  for (let k = 0; k < total; k++) {
    if (pos + 46 > eocd || zip.readUInt32LE(pos) !== 0x02014b50) throw new Error('Archive invalide')
    const hote = zip.readUInt16LE(pos + 4) >> 8
    const drapeaux = zip.readUInt16LE(pos + 8)
    const methode = zip.readUInt16LE(pos + 10)
    const crc = zip.readUInt32LE(pos + 16)
    const comprime = zip.readUInt32LE(pos + 20)
    const taille = zip.readUInt32LE(pos + 24)
    const longNom = zip.readUInt16LE(pos + 28)
    const suite = zip.readUInt16LE(pos + 30) + zip.readUInt16LE(pos + 32)
    const attributs = zip.readUInt32LE(pos + 38)
    const local = zip.readUInt32LE(pos + 42)
    if (pos + 46 + longNom + suite > eocd) throw new Error('Archive invalide')
    const nom = zip.toString('utf8', pos + 46, pos + 46 + longNom)
    pos += 46 + longNom + suite
    if (drapeaux & 1) throw new Error('Archive chiffrée refusée')
    if (methode !== 0 && methode !== 8) throw new Error('Méthode de compression non prise en charge')
    if (comprime === 0xffffffff || taille === 0xffffffff || local === 0xffffffff)
      throw new Error('Archive zip64 refusée')
    if (hote === 3) {
      const type = (attributs >>> 16) & 0xf000
      if (type !== 0 && type !== 0x8000 && type !== 0x4000) throw new Error('Lien ou fichier spécial refusé')
    }
    const segments = segmentsSurs(nom)
    const dossier = nom.endsWith('/')
    if (segments.length - (dossier ? 0 : 1) > lim.profondeur) throw new Error('Dossier trop profond')
    const cle = segments.join('/').toLowerCase()
    if (vus.has(cle)) throw new Error('Doublon dans l’archive')
    vus.add(cle)
    somme += taille
    if (somme > lim.octets) throw new Error('Extension trop volumineuse')
    entrees.push({ segments, dossier, methode, crc, comprime, taille, local })
  }
  return { entrees, debutRepertoire: debut }
}

function contenu(zip: Buffer, e: Entree, debutRepertoire: number): Buffer {
  const l = e.local
  if (l + 30 > debutRepertoire || zip.readUInt32LE(l) !== 0x04034b50) throw new Error('Archive invalide')
  const debut = l + 30 + zip.readUInt16LE(l + 26) + zip.readUInt16LE(l + 28)
  const fin = debut + e.comprime
  if (fin > debutRepertoire) throw new Error('Archive invalide')
  const brut = zip.subarray(debut, fin)
  let octets: Buffer
  if (e.methode === 0) octets = brut
  else {
    try {
      octets = inflateRawSync(brut, { maxOutputLength: Math.max(e.taille, 1) })
    } catch {
      throw new Error('Archive corrompue')
    }
  }
  if (octets.length !== e.taille || crc32(octets) !== e.crc) throw new Error('Archive corrompue')
  return octets
}

// Écrit l'archive sous `destination` (dossier à créer par l'appelant, de préférence temporaire : une erreur peut laisser des
// fichiers déjà écrits).
export function extraireZip(zip: Buffer, destination: string, lim: LimitesZip): void {
  const { entrees, debutRepertoire } = lireRepertoire(zip, lim)
  const racine = resolve(destination)
  mkdirSync(racine, { recursive: true })
  for (const e of entrees) {
    const chemin = resolve(join(racine, ...e.segments))
    if (!chemin.startsWith(racine + sep)) throw new Error('Chemin refusé dans l’archive')
    if (e.dossier) mkdirSync(chemin, { recursive: true })
    else {
      const octets = contenu(zip, e, debutRepertoire)
      mkdirSync(dirname(chemin), { recursive: true })
      writeFileSync(chemin, octets, { flag: 'wx' })
    }
  }
}
