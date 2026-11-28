// Garde-fou de l'installeur (ARB-75) : la configuration electron-builder ne référence que des fichiers qui existent,
// et les ressources attendues hors d'app.asar (icône, licences des polices) y figurent.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FUSES_ATTENDUS } from './shared/fuses.ts'

const racine = resolve(import.meta.dirname, '..')
const config = readFileSync(resolve(racine, 'electron-builder.yml'), 'utf8')

test("chaque source d'extraResources existe", () => {
  const sources = [...config.matchAll(/^\s+- from: (.+)$/gm)].map((m) => m[1])
  assert.ok(sources.length >= 3)
  for (const s of sources) assert.ok(existsSync(resolve(racine, s)), `introuvable : ${s}`)
})

test("l'icône est embarquée hors asar sous le nom que lit CHEMIN_ICONE", () => {
  assert.match(config, /from: resources\/icone\.ico\n\s+to: icone\.ico/)
  assert.match(
    readFileSync(resolve(racine, 'src/main/index.ts'), 'utf8'),
    /join\(process\.resourcesPath, 'icone\.ico'\)/
  )
})

test("les licences OFL des polices accompagnent l'application", () => {
  assert.match(config, /to: licences-polices/)
})

test("scripts/dist.mjs donne à l'application la version du fichier VERSION", () => {
  const script = readFileSync(resolve(racine, 'scripts/dist.mjs'), 'utf8')
  assert.match(script, /extraMetadata\.version=/)
  assert.match(script, /\.\.\/\.\.\/VERSION/)
  assert.match(
    readFileSync(resolve(racine, 'package.json'), 'utf8'),
    /"dist": "electron-vite build && node scripts\/dist\.mjs"/
  )
})

test("la configuration et le script de l'installeur sont aux emplacements attendus du dépôt", () => {
  for (const f of [
    'arbalete-browser/electron-builder.yml',
    'arbalete-browser/scripts/dist.mjs',
    'arbalete-browser/build/installer.nsh'
  ]) {
    assert.ok(existsSync(resolve(racine, '..', f)), `introuvable : ${f}`)
  }
})

test("l'installeur déclare Arbalète à Windows pour http et https, et retire la déclaration à la désinstallation (ARB-80)", () => {
  assert.match(config, /include: build\/installer\.nsh/)
  const nsh = readFileSync(resolve(racine, 'build/installer.nsh'), 'utf8')
  const [installation, desinstallation] = nsh.split('!macro customUnInstall')
  assert.match(installation, /URLAssociations" "http" "ArbaleteURL"/)
  assert.match(installation, /URLAssociations" "https" "ArbaleteURL"/)
  assert.ok(installation.includes('"Arbalete" "Software\\Clients\\StartMenuInternet\\Arbalete\\Capabilities"'))
  assert.ok(
    installation.includes('ArbaleteURL\\shell\\open\\command" "" \'"$INSTDIR\\${APP_EXECUTABLE_FILENAME}" -- "%1"\'')
  ) // « -- » : un guillemet dans l'adresse ne peut pas ajouter d'options à Chromium
  assert.ok(desinstallation.includes('DeleteRegValue HKCU "Software\\RegisteredApplications" "Arbalete"'))
  assert.ok(desinstallation.includes('DeleteRegKey HKCU "Software\\Clients\\StartMenuInternet\\Arbalete"'))
  assert.ok(desinstallation.includes('DeleteRegKey HKCU "Software\\Classes\\ArbaleteURL"'))
})

test('mises à jour automatiques (ARB-77) : publication GitHub, version semver, workflow de release', () => {
  assert.match(config, /^publish:\r?\n\s+provider: github\r?\n\s+owner: salocinski\r?\n\s+repo: Arbalete\r?$/m)
  const script = readFileSync(resolve(racine, 'scripts/dist.mjs'), 'utf8')
  assert.match(script, /extraMetadata\.version=\$\{versionSemver\(version\)\}/)
  assert.match(script, /'--publish',\s+'never'/)
  const release = readFileSync(resolve(racine, '..', '.github/workflows/release.yml'), 'utf8')
  assert.match(release, /^ {4}if: github\.ref == 'refs\/heads\/main'\r?$/m)
  assert.match(release, /^permissions:\r?\n {2}contents: read\r?$/m)
  assert.equal((release.match(/contents: write/g) ?? []).length, 1, 'une seule écriture, au niveau du job')
  assert.ok(!release.includes('pull_request'))
  for (const ligne of release.split('\n').filter((l) => /^\s*-?\s*uses:/.test(l)))
    assert.match(ligne, /@[0-9a-f]{40}(\s|$)/, ligne)
})

test("signature du code (ARB-76) : publisherName, application puis installeur signés par SignPath, latest.yml remis d'accord", () => {
  assert.match(config, /^ {2}publisherName:\r?\n {4}- SignPath Foundation\r?$/m)
  const release = readFileSync(resolve(racine, '..', '.github/workflows/release.yml'), 'utf8')
  // Ordre : build non signé (écrit app-update.yml), signature de l'application, installeur refait depuis elle, signature de l'installeur, latest.yml, Release.
  const etapes = [
    'run: npm run dist\n',
    'artifact-configuration-slug: application',
    'node scripts/smoke-exe.mjs release/win-unpacked/Arbalete.exe',
    '--prepackaged release/win-unpacked',
    'artifact-configuration-slug: installeur',
    'node scripts/apres-signature.mjs',
    'gh release create'
  ]
  const places = etapes.map((e) => release.indexOf(e))
  assert.ok(
    places.every((p) => p > 0),
    `étape absente : ${etapes.filter((_, i) => places[i] < 0)}`
  )
  assert.deepEqual(
    places,
    [...places].sort((a, b) => a - b),
    'étapes dans le désordre'
  )
  assert.equal((release.match(/SignPath\/github-action-submit-signing-request@/g) ?? []).length, 2)
  assert.equal(
    (release.match(/Get-AuthenticodeSignature/g) ?? []).length,
    2,
    "contrôle de l'application et de l'installeur"
  )
  const sujets = [...release.matchAll(/CN=([A-Za-z ]+)'/g)].map((m) => m[1])
  assert.deepEqual(sujets, ['SignPath Foundation', 'SignPath Foundation'])
  assert.ok(config.includes(`- ${sujets[0]}`), "le sujet contrôlé est le publisherName d'electron-updater")
  assert.match(readFileSync(resolve(racine, 'scripts/dist.mjs'), 'utf8'), /\.\.\.process\.argv\.slice\(2\)/)
  assert.match(
    release,
    /^ {6}- name: Vérifier la configuration de signature\r?\n(?: {8}.*\r?\n)*? {8}working-directory: \./m
  )
  assert.ok(!release.includes('.blockmap'), "le blockmap de l'installeur non signé ne se publie pas")
  assert.equal(
    (release.match(/secrets\.SIGNPATH_API_TOKEN/g) ?? []).length,
    3,
    "le jeton ne sert qu'au contrôle de présence et aux deux signatures"
  )
  const script = readFileSync(resolve(racine, '..', 'arbalete-browser/scripts/apres-signature.mjs'), 'utf8')
  assert.match(script, /import \{ majLatest \} from '\.\.\/src\/shared\/signature\.ts'/)
  const application = readFileSync(resolve(racine, '..', '.signpath/artifact-configuration-application.xml'), 'utf8')
  const installeur = readFileSync(resolve(racine, '..', '.signpath/artifact-configuration-installeur.xml'), 'utf8')
  assert.match(application, /<pe-file path="Arbalete\.exe">\s*<authenticode-sign \/>/)
  assert.match(installeur, /<pe-file path="Arbalete-Setup-\*\.exe">\s*<authenticode-sign \/>/)
})

// Lit le bloc `electronFuses:` ligne à ligne : l'ordre des clés, les commentaires et les fuses ajoutés ne comptent pas.
function fusesConfigures(): Map<string, string> {
  const lignes = config.split('\n')
  const debut = lignes.findIndex((l) => l.trimEnd() === 'electronFuses:')
  const fuses = new Map<string, string>()
  if (debut < 0) return fuses
  for (const ligne of lignes.slice(debut + 1)) {
    if (ligne.trim() === '' || ligne.trim().startsWith('#')) continue
    if (!/^\s/.test(ligne)) break // fin du bloc : clé de premier niveau suivante
    const m = ligne.match(/^\s+(\w+):\s*(\S+?)\s*(?:#.*)?\r?$/)
    if (m) fuses.set(m[1], m[2])
  }
  return fuses
}

test('les fuses d’electron-builder.yml sont ceux que dist.mjs relit sur le binaire (ARB-137)', () => {
  const fuses = fusesConfigures()
  const attendus = Object.fromEntries(Object.entries(FUSES_ATTENDUS).map(([nom, v]) => [nom, String(v)]))
  assert.deepEqual(Object.fromEntries(fuses), attendus)
  // L'interface est chargée en file:// tant qu'ARB-138 n'est pas fait : ce fuse reste à sa valeur par défaut.
  assert.equal(fuses.has('grantFileProtocolExtraPrivileges'), false)
})

test('scripts/dist.mjs relit les fuses sur le binaire produit (ARB-137)', () => {
  const script = readFileSync(resolve(racine, 'scripts/dist.mjs'), 'utf8')
  assert.match(script, /ecartsFuses\(readFileSync\(exe\)\)/)
  assert.match(script, /dossierApplication\(process\.argv\.slice\(2\)\)/)
})
