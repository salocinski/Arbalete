import { createHash, createPublicKey, verify } from 'node:crypto'

// Fichier .crx du Chrome Web Store (ARB-161, EP-04) : en-tête CRX3 (« Cr24 », version 3, taille de l'en-tête, en-tête protobuf)
// suivi de l'archive zip. L'en-tête porte des preuves (clé publique + signature) sur « CRX3 SignedData » + l'archive : on les
// vérifie toutes, et au moins une doit venir de la clé dont l'empreinte est l'identifiant demandé, comme Chrome. Le fichier
// vient du réseau, donc hostile : tout est borné et une erreur ne dit rien de plus que « invalide ».

export const EN_TETE_MAX = 1024 * 1024
const MAGIE = Buffer.from('Cr24', 'latin1')
const PREFIXE_SIGNATURE = Buffer.from('CRX3 SignedData\0', 'latin1')

type Champ = { numero: number; octets: Buffer }

// Lecture protobuf minimale : champs à longueur préfixée (type 2), les entiers (0) et les flottants (1, 5) sont sautés.
function lireChamps(b: Buffer): Champ[] {
  const champs: Champ[] = []
  let pos = 0
  const varint = (): number => {
    let valeur = 0
    for (let i = 0; i < 5; i++) {
      if (pos >= b.length) throw new Error('Protobuf tronqué')
      const o = b[pos++]
      valeur += (o & 0x7f) * 2 ** (7 * i)
      if ((o & 0x80) === 0) return valeur
    }
    throw new Error('Varint trop long')
  }
  while (pos < b.length) {
    const cle = varint()
    const type = cle % 8
    const numero = Math.floor(cle / 8)
    if (type === 2) {
      const taille = varint()
      if (pos + taille > b.length) throw new Error('Protobuf tronqué')
      champs.push({ numero, octets: b.subarray(pos, pos + taille) })
      pos += taille
    } else if (type === 0) varint()
    else if (type === 1) pos += 8
    else if (type === 5) pos += 4
    else throw new Error('Protobuf invalide')
  }
  if (pos > b.length) throw new Error('Protobuf tronqué')
  return champs
}

// Identifiant d'extension d'une clé publique (DER) : 16 premiers octets de son SHA-256, chaque demi-octet écrit a à p.
export function idDepuisCle(cle: Buffer): string {
  return idDepuisOctets(createHash('sha256').update(cle).digest().subarray(0, 16))
}

// Renvoie l'archive zip du .crx dont la signature est valide et dont l'identifiant est `idAttendu`, sinon lève.
export function lireCrx(crx: Buffer, idAttendu: string): Buffer {
  if (crx.length < 12 || !crx.subarray(0, 4).equals(MAGIE)) throw new Error('Fichier .crx invalide')
  if (crx.readUInt32LE(4) !== 3) throw new Error('Seul le format CRX3 est pris en charge')
  const tailleEnTete = crx.readUInt32LE(8)
  if (tailleEnTete === 0 || tailleEnTete > EN_TETE_MAX || 12 + tailleEnTete >= crx.length)
    throw new Error('Fichier .crx invalide')
  const zip = crx.subarray(12 + tailleEnTete)
  try {
    const champs = lireChamps(crx.subarray(12, 12 + tailleEnTete))
    const signees = champs.filter((c) => c.numero === 10000)
    if (signees.length !== 1) throw new Error('en-tête signé absent')
    const idSigne = lireChamps(signees[0].octets).filter((c) => c.numero === 1)
    if (idSigne.length !== 1 || idSigne[0].octets.length !== 16) throw new Error('identifiant absent')
    const idCrx = idDepuisOctets(idSigne[0].octets)
    if (idCrx !== idAttendu) throw new Error('identifiant différent')
    const taille = Buffer.alloc(4)
    taille.writeUInt32LE(signees[0].octets.length)
    const donnees = Buffer.concat([PREFIXE_SIGNATURE, taille, signees[0].octets, zip])
    let preuveDeLId = false
    let preuves = 0
    for (const c of champs) {
      if (c.numero !== 2 && c.numero !== 3) continue
      const preuve = lireChamps(c.octets)
      const cle = preuve.find((p) => p.numero === 1)?.octets
      const signature = preuve.find((p) => p.numero === 2)?.octets
      if (!cle || !signature) throw new Error('preuve incomplète')
      const publique = createPublicKey({ key: cle, format: 'der', type: 'spki' })
      if (!verify('sha256', donnees, publique, signature)) throw new Error('signature fausse')
      preuves++
      if (idDepuisCle(cle) === idAttendu) preuveDeLId = true
    }
    if (preuves === 0 || !preuveDeLId) throw new Error('aucune preuve de l’identifiant')
  } catch {
    throw new Error('Signature de l’extension invalide')
  }
  return zip
}

function idDepuisOctets(octets: Buffer): string {
  let id = ''
  for (const o of octets) id += String.fromCharCode(97 + (o >> 4)) + String.fromCharCode(97 + (o & 15))
  return id
}
