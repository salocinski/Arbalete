import { createHash, createSign, generateKeyPairSync, type KeyObject } from 'node:crypto'
import { crc32, deflateRawSync } from 'node:zlib'
import { idDepuisCle } from './crx.ts'

// Fabrique d'archives zip et de .crx pour les tests (ARB-161) : jamais importée par l'application.

export type FichierZip = {
  nom: string
  contenu: string | Buffer
  methode?: 0 | 8
  hote?: number // 3 = Unix, pour les attributs
  attributs?: number // attributs externes (mode Unix << 16)
  crc?: number // CRC mensonger
  taille?: number // taille annoncée mensongère
  drapeaux?: number
}

const u16 = (n: number) => {
  const b = Buffer.alloc(2)
  b.writeUInt16LE(n)
  return b
}
const u32 = (n: number) => {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(n >>> 0)
  return b
}

export function fabriquerZip(fichiers: FichierZip[]): Buffer {
  const locaux: Buffer[] = []
  const centraux: Buffer[] = []
  let decalage = 0
  for (const f of fichiers) {
    const brut = Buffer.from(f.contenu)
    const methode = f.methode ?? 8
    const donnees = methode === 8 ? deflateRawSync(brut) : brut
    const nom = Buffer.from(f.nom, 'utf8')
    const crc = f.crc ?? crc32(brut)
    const taille = f.taille ?? brut.length
    const drapeaux = f.drapeaux ?? 0
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(drapeaux),
      u16(methode),
      u16(0),
      u16(0),
      u32(crc),
      u32(donnees.length),
      u32(taille),
      u16(nom.length),
      u16(0),
      nom,
      donnees
    ])
    centraux.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(((f.hote ?? 0) << 8) | 20),
        u16(20),
        u16(drapeaux),
        u16(methode),
        u16(0),
        u16(0),
        u32(crc),
        u32(donnees.length),
        u32(taille),
        u16(nom.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(f.attributs ?? 0),
        u32(decalage),
        nom
      ])
    )
    locaux.push(local)
    decalage += local.length
  }
  const repertoire = Buffer.concat(centraux)
  const fin = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(fichiers.length),
    u16(fichiers.length),
    u32(repertoire.length),
    u32(decalage),
    u16(0)
  ])
  return Buffer.concat([...locaux, repertoire, fin])
}

export type Cle = { publique: Buffer; privee: KeyObject; id: string }

export function fabriquerCle(): Cle {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const publique = publicKey.export({ type: 'spki', format: 'der' })
  return { publique, privee: privateKey, id: idDepuisCle(publique) }
}

function varint(n: number): Buffer {
  const octets: number[] = []
  while (n >= 0x80) {
    octets.push((n % 0x80) | 0x80)
    n = Math.floor(n / 0x80)
  }
  octets.push(n)
  return Buffer.from(octets)
}
const champ = (numero: number, donnees: Buffer) =>
  Buffer.concat([varint(numero * 8 + 2), varint(donnees.length), donnees])

export type OptionsCrx = {
  version?: number // version du format (3 par défaut)
  idPublieDe?: Cle // l'identifiant écrit dans l'en-tête signé vient de cette autre clé
  falsifierSignature?: boolean
}

export function fabriquerCrx(zip: Buffer, cle: Cle, options: OptionsCrx = {}): Buffer {
  const idOctets = createHash('sha256')
    .update((options.idPublieDe ?? cle).publique)
    .digest()
    .subarray(0, 16)
  const signee = champ(1, idOctets)
  const charge = Buffer.concat([Buffer.from('CRX3 SignedData\0', 'latin1'), u32(signee.length), signee, zip])
  const signature = createSign('sha256').update(charge).sign(cle.privee)
  if (options.falsifierSignature) signature[0] ^= 0xff
  const enTete = Buffer.concat([
    champ(2, Buffer.concat([champ(1, cle.publique), champ(2, signature)])),
    champ(10000, signee)
  ])
  return Buffer.concat([Buffer.from('Cr24', 'latin1'), u32(options.version ?? 3), u32(enTete.length), enTete, zip])
}
