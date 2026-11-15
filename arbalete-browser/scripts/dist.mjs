// Construit l'installeur (ARB-75) en donnant à l'application la version du fichier VERSION (4 segments), pas celle de package.json.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const racine = fileURLToPath(new URL('..', import.meta.url))
const version = readFileSync(new URL('../../VERSION', import.meta.url), 'utf8').trim()
if (!/^\d+\.\d+\.\d+\.\d+$/.test(version)) {
  console.error(`VERSION illisible : « ${version} »`)
  process.exit(1)
}
const r = spawnSync('npx', ['electron-builder', `-c.extraMetadata.version=${version}`], { cwd: racine, stdio: 'inherit', shell: true })
process.exit(r.status ?? 1)
