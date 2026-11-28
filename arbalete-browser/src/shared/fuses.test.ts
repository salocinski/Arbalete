import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dossierApplication, ecartsFuses, FUSES_ATTENDUS, lireFuses } from './fuses.ts'

const MARQUEUR = 'dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'
// Binaire factice : du bruit, le marqueur, version 1, nombre de fuses, un octet par fuse.
function binaire(fil: string, version = 1): Buffer {
  return Buffer.concat([
    Buffer.from('bruit'),
    Buffer.from(MARQUEUR),
    Buffer.from([version, fil.length]),
    Buffer.from(fil),
    Buffer.from('suite')
  ])
}
// Ordre : runAsNode, cookie, NODE_OPTIONS, inspection, intégrité asar, asar seul, snapshot V8, privilèges file:.
const CONFORME = '00001101'

test('lit les fuses du binaire, un octet par fuse dans l’ordre d’Electron', () => {
  assert.deepEqual(lireFuses(binaire(CONFORME)), {
    runAsNode: false,
    enableCookieEncryption: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    loadBrowserProcessSpecificV8Snapshot: false,
    grantFileProtocolExtraPrivileges: true
  })
})

test('un fil plus long que la liste connue est lu sans erreur, les fuses inconnus sont ignorés', () => {
  assert.equal(Object.keys(lireFuses(binaire(CONFORME + '11')) ?? {}).length, 8)
})

test('un fuse retiré (r) n’est ni vrai ni faux, un fil plus court que la liste est lu tel quel', () => {
  assert.deepEqual(lireFuses(binaire('0r')), { runAsNode: false })
})

test('un binaire sans marqueur ou d’une autre version du format n’est pas lu', () => {
  assert.equal(lireFuses(Buffer.from('rien')), null)
  assert.equal(lireFuses(binaire(CONFORME, 2)), null)
  assert.deepEqual(ecartsFuses(Buffer.from('rien')), ['fuses introuvables ou version inconnue'])
})

test('ecartsFuses : vide si conforme, une phrase par fuse qui diffère', () => {
  assert.deepEqual(ecartsFuses(binaire(CONFORME)), [])
  const ecarts = ecartsFuses(binaire('10101101')) // runAsNode et NODE_OPTIONS allumés
  assert.equal(ecarts.length, 2)
  assert.match(ecarts.join('\n'), /runAsNode : attendu false, lu true/)
  assert.match(ecarts.join('\n'), /enableNodeOptionsEnvironmentVariable : attendu false, lu true/)
  assert.deepEqual(ecartsFuses(binaire('00000001')).length, 2) // intégrité asar et asar seul éteints
  assert.ok(Object.keys(FUSES_ATTENDUS).length >= 5)
})
test('lireFuses refuse un fil qui n’en est pas un (octets inattendus, nombre aberrant, fil tronqué)', () => {
  assert.equal(lireFuses(binaire('00xx1101')), null)
  assert.equal(lireFuses(binaire('')), null)
  assert.equal(lireFuses(Buffer.concat([Buffer.from(MARQUEUR), Buffer.from([1, 200]), Buffer.from('0000')])), null)
})

test('dossierApplication : --prepackaged ou --pd, avec espace ou =, défaut sinon, null sans valeur', () => {
  assert.equal(dossierApplication([]), 'release/win-unpacked')
  assert.equal(dossierApplication(['--publish', 'never']), 'release/win-unpacked')
  assert.equal(dossierApplication(['--prepackaged', 'release/signe']), 'release/signe')
  assert.equal(dossierApplication(['--prepackaged=release/signe']), 'release/signe')
  assert.equal(dossierApplication(['--pd', 'a']), 'a')
  assert.equal(dossierApplication(['--pd=a=b']), 'a=b')
  assert.equal(dossierApplication(['--prepackaged']), null)
  assert.equal(dossierApplication(['--prepackaged', '--publish', 'never']), null)
  assert.equal(dossierApplication(['--prepackaged=']), null)
})
