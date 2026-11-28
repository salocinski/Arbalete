// Construit l'installeur (ARB-75) en donnant à l'application la version du fichier VERSION (repliée en semver, ARB-77), pas celle de package.json.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dossierApplication, ecartsFuses } from '../src/shared/fuses.ts'
import { versionSemver } from '../src/shared/version.ts'

const racine = fileURLToPath(new URL('..', import.meta.url))
const version = readFileSync(new URL('../../VERSION', import.meta.url), 'utf8').trim()
if (!/^\d+\.\d+\.\d+\.\d+$/.test(version)) {
  console.error(`VERSION illisible : « ${version} »`)
  process.exit(1)
}
// ARB-77 : electron-updater compare des versions semver à 3 segments, le 4e segment est replié dans le patch (0.12.44.22 -> 0.12.44022).
// `--publish never` : la publication est faite par .github/workflows/release.yml, jamais par un build local.
// ARB-76 : release.yml relance ce script avec `--prepackaged release/win-unpacked` pour refaire l'installeur de l'application signée.
const r = spawnSync(
  'npx',
  [
    'electron-builder',
    '--publish',
    'never',
    `-c.extraMetadata.version=${versionSemver(version)}`,
    ...process.argv.slice(2)
  ],
  { cwd: racine, stdio: 'inherit', shell: true }
)
if (r.status !== 0) process.exit(r.status ?? 1)
// ARB-137 : les fuses sont relus sur le binaire produit (aussi sur l'application signée de --prepackaged).
const dossier = dossierApplication(process.argv.slice(2))
if (!dossier) {
  console.error('--prepackaged sans dossier')
  process.exit(1)
}
const exe = resolve(racine, dossier, 'Arbalete.exe')
if (!existsSync(exe)) {
  console.error(`Fuses non vérifiés : ${exe} introuvable`)
  process.exit(1)
}
const ecarts = ecartsFuses(readFileSync(exe))
if (ecarts.length > 0) {
  console.error('Fuses d’Electron non conformes :\n' + ecarts.map((e) => '  ' + e).join('\n'))
  process.exit(1)
}
console.log('Fuses d’Electron conformes')
