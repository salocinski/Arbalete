import { strictEqual, throws } from 'node:assert/strict'
import { test } from 'node:test'
import { lireCrx } from './crx.ts'
import { fabriquerCle, fabriquerCrx, fabriquerZip } from './fabriqueCrx.ts'

// Tests de la lecture d'un .crx (ARB-161) : signature CRX3 vérifiée, identifiant exigé, tout le reste refusé.

const zip = fabriquerZip([{ nom: 'manifest.json', contenu: '{}' }])
const cle = fabriquerCle()

test('un .crx signé par la clé de son identifiant rend son archive', () => {
  strictEqual(lireCrx(fabriquerCrx(zip, cle), cle.id).equals(zip), true)
})

test('un autre identifiant demandé, une archive ou une signature altérées sont refusés', () => {
  const crx = fabriquerCrx(zip, cle)
  throws(() => lireCrx(crx, fabriquerCle().id), /Signature/)
  const altere = Buffer.from(crx)
  altere[altere.length - 30] ^= 1 // un octet de l'archive
  throws(() => lireCrx(altere, cle.id), /Signature/)
  throws(() => lireCrx(fabriquerCrx(zip, cle, { falsifierSignature: true }), cle.id), /Signature/)
})

test('une preuve d’une autre clé que celle de l’identifiant est refusée', () => {
  const autre = fabriquerCle()
  // L'en-tête annonce l'identifiant de `autre`, mais seule `cle` a signé.
  throws(() => lireCrx(fabriquerCrx(zip, cle, { idPublieDe: autre }), autre.id), /Signature/)
})

test('format CRX2, en-tête absurde, fichier tronqué ou sans « Cr24 » refusés', () => {
  throws(() => lireCrx(fabriquerCrx(zip, cle, { version: 2 }), cle.id), /CRX3/)
  throws(() => lireCrx(Buffer.from('PK\x03\x04 pas un crx'), cle.id), /invalide/)
  throws(() => lireCrx(Buffer.alloc(5), cle.id), /invalide/)
  const crx = fabriquerCrx(zip, cle)
  const enorme = Buffer.from(crx)
  enorme.writeUInt32LE(0x7fffffff, 8)
  throws(() => lireCrx(enorme, cle.id), /invalide/)
  throws(() => lireCrx(crx.subarray(0, 40), cle.id), /Fichier|Signature|invalide/)
})
