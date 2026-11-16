// Garde-fou de scripts/apres-signature.mjs (ARB-76) : latest.yml suit l'installeur signé, le blockmap périmé disparaît.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error script .mjs sans déclaration de types
import { traiter } from '../scripts/apres-signature.mjs'

const latest = 'version: 1.0.0\nfiles:\n  - url: Arbalete-Setup-1.0.0.exe\n    sha512: ancien\n    size: 1\npath: Arbalete-Setup-1.0.0.exe\nsha512: ancien\n'

function dossier(...fichiers: string[]): string {
  const d = mkdtempSync(join(tmpdir(), 'arb-sig-'))
  for (const f of fichiers) writeFileSync(join(d, f), f === 'latest.yml' ? latest : 'contenu signé')
  return d + '/'
}

test('traiter écrit le sha512 en base64 et la taille du fichier signé, et supprime le blockmap', () => {
  const d = dossier('Arbalete-Setup-1.0.0.exe', 'Arbalete-Setup-1.0.0.exe.blockmap', 'latest.yml')
  try {
    traiter(d)
    const attendu = createHash('sha512').update('contenu signé').digest('base64')
    const yml = readFileSync(d + 'latest.yml', 'utf8')
    assert.equal(yml.split(`sha512: ${attendu}`).length - 1, 2)
    assert.match(yml, new RegExp(`^ {4}size: ${Buffer.byteLength('contenu signé')}$`, 'm'))
    assert.ok(!existsSync(d + 'Arbalete-Setup-1.0.0.exe.blockmap'))
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})

test('traiter refuse zéro ou plusieurs installeurs', () => {
  for (const fichiers of [['latest.yml'], ['Arbalete-Setup-1.0.0.exe', 'Arbalete-Setup-2.0.0.exe', 'latest.yml']]) {
    const d = dossier(...fichiers)
    try {
      assert.throws(() => traiter(d), /Un seul installeur/)
    } finally {
      rmSync(d, { recursive: true, force: true })
    }
  }
})
