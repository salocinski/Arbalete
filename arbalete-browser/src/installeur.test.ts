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
  for (const f of ['arbalete-browser/electron-builder.yml', 'arbalete-browser/scripts/dist.mjs', 'arbalete-browser/build/installer.nsh']) {
    assert.ok(existsSync(resolve(racine, '..', f)), `introuvable : ${f}`)
  }
})

test('l\'installeur déclare Arbalète à Windows pour http et https, et retire la déclaration à la désinstallation (ARB-80)', () => {
  assert.match(config, /include: build\/installer\.nsh/)
  const nsh = readFileSync(resolve(racine, 'build/installer.nsh'), 'utf8')
  const [installation, desinstallation] = nsh.split('!macro customUnInstall')
  assert.match(installation, /URLAssociations" "http" "ArbaleteURL"/)
  assert.match(installation, /URLAssociations" "https" "ArbaleteURL"/)
  assert.ok(installation.includes('"Arbalete" "Software\\Clients\\StartMenuInternet\\Arbalete\\Capabilities"'))
  assert.ok(installation.includes('ArbaleteURL\\shell\\open\\command" "" \'"$INSTDIR\\${APP_EXECUTABLE_FILENAME}" -- "%1"\'')) // « -- » : un guillemet dans l'adresse ne peut pas ajouter d'options à Chromium
  assert.ok(desinstallation.includes('DeleteRegValue HKCU "Software\\RegisteredApplications" "Arbalete"'))
  assert.ok(desinstallation.includes('DeleteRegKey HKCU "Software\\Clients\\StartMenuInternet\\Arbalete"'))
  assert.ok(desinstallation.includes('DeleteRegKey HKCU "Software\\Classes\\ArbaleteURL"'))
})

test('mises à jour automatiques (ARB-77) : publication GitHub, version semver, workflow de release', () => {
  assert.match(config, /^publish:\r?\n\s+provider: github\r?\n\s+owner: salocinski\r?\n\s+repo: Arbalete\r?$/m)
  const script = readFileSync(resolve(racine, 'scripts/dist.mjs'), 'utf8')
  assert.match(script, /extraMetadata\.version=\$\{versionSemver\(version\)\}/)
  assert.match(script, /'--publish', 'never'/)
  const release = readFileSync(resolve(racine, '..', '.github/workflows/release.yml'), 'utf8')
  assert.match(release, /^ {4}if: github\.ref == 'refs\/heads\/main'\r?$/m)
  assert.match(release, /^permissions:\r?\n {2}contents: read\r?$/m)
  assert.equal((release.match(/contents: write/g) ?? []).length, 1, 'une seule écriture, au niveau du job')
  assert.ok(!release.includes('pull_request'))
  for (const ligne of release.split('\n').filter((l) => /^\s*-?\s*uses:/.test(l))) assert.match(ligne, /@[0-9a-f]{40}(\s|$)/, ligne)
})
