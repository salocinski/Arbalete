// Garde-fou de l'installeur (ARB-75) : la configuration electron-builder ne référence que des fichiers qui existent,
// et les ressources attendues hors d'app.asar (icône, licences des polices) y figurent.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const racine = resolve(import.meta.dirname, '..')
const config = readFileSync(resolve(racine, 'electron-builder.yml'), 'utf8')

test('chaque source d\'extraResources existe', () => {
  const sources = [...config.matchAll(/^\s+- from: (.+)$/gm)].map((m) => m[1])
  assert.ok(sources.length >= 3)
  for (const s of sources) assert.ok(existsSync(resolve(racine, s)), `introuvable : ${s}`)
})

test('l\'icône est embarquée hors asar sous le nom que lit CHEMIN_ICONE', () => {
  assert.match(config, /from: resources\/icone\.ico\n\s+to: icone\.ico/)
  assert.match(readFileSync(resolve(racine, 'src/main/index.ts'), 'utf8'), /join\(process\.resourcesPath, 'icone\.ico'\)/)
})

test('les licences OFL des polices accompagnent l\'application', () => {
  assert.match(config, /to: licences-polices/)
})

test('scripts/dist.mjs donne à l\'application la version du fichier VERSION', () => {
  const script = readFileSync(resolve(racine, 'scripts/dist.mjs'), 'utf8')
  assert.match(script, /extraMetadata\.version=/)
  assert.match(script, /\.\.\/\.\.\/VERSION/)
  assert.match(readFileSync(resolve(racine, 'package.json'), 'utf8'), /"dist": "electron-vite build && node scripts\/dist\.mjs"/)
})

test('la configuration et le script de l\'installeur sont aux emplacements attendus du dépôt', () => {
  for (const f of ['arbalete-browser/electron-builder.yml', 'arbalete-browser/scripts/dist.mjs']) {
    assert.ok(existsSync(resolve(racine, '..', f)), `introuvable : ${f}`)
  }
})
