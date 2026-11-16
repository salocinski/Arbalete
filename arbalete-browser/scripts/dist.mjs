// Construit l'installeur (ARB-75) en donnant à l'application la version du fichier VERSION (repliée en semver, ARB-77), pas celle de package.json.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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
const r = spawnSync('npx', ['electron-builder', '--publish', 'never', `-c.extraMetadata.version=${versionSemver(version)}`, ...process.argv.slice(2)], { cwd: racine, stdio: 'inherit', shell: true })
process.exit(r.status ?? 1)
