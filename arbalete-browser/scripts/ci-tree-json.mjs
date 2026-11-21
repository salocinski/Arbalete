// Écrit tree.json (ARB-133) : l'enregistrement que /ship lit pour reprendre un job de la CI au lieu de relancer ses
// contrôles (.gstack/pregate.json, `run_profiles`). Lancé en CI après les contrôles d'un job réussi, jamais à la main.
// Usage : node scripts/ci-tree-json.mjs <sortie.json> <motif-de-test>...
// Les motifs se lisent depuis arbalete-browser/ ; les chemins écrits partent de la racine du dépôt.
import { execFileSync } from 'node:child_process'
import { globSync, writeFileSync } from 'node:fs'

const [sortie, ...motifs] = process.argv.slice(2)
if (!sortie || motifs.length === 0) {
  console.error('usage : node scripts/ci-tree-json.mjs <sortie.json> <motif-de-test>...')
  process.exit(2)
}
const fichiers = globSync(motifs)
  .map((f) => 'arbalete-browser/' + f.replaceAll('\\', '/'))
  .sort()
if (fichiers.length === 0) {
  console.error('aucun fichier de test ne correspond aux motifs')
  process.exit(1)
}
const env = process.env
for (const nom of ['GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_EVENT_NAME', 'GITHUB_SHA', 'RUNNER_OS']) {
  if (!env[nom]) {
    console.error(`${nom} absent : ce script ne tourne qu'en CI`)
    process.exit(2)
  }
}

// Sur pull_request, GITHUB_SHA est le commit de fusion testé ; head_sha est la tête de la branche.
const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim()
writeFileSync(
  sortie,
  JSON.stringify({
    run_id: Number(env.GITHUB_RUN_ID),
    run_attempt: Number(env.GITHUB_RUN_ATTEMPT),
    event: env.GITHUB_EVENT_NAME,
    sha: env.GITHUB_SHA,
    head_sha: env.PR_HEAD_SHA || env.GITHUB_SHA,
    tree,
    os: env.RUNNER_OS,
    files: fichiers,
    tests: fichiers.length
  }) + '\n'
)
