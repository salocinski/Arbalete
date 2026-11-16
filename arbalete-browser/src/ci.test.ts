import { spawnSync } from 'node:child_process'
import { ok, strictEqual } from 'node:assert/strict'
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

// Garde-fous du workflow de CI (ARB-8, .github/workflows/ci.yml) : il reste en lecture seule, ses actions restent
// épinglées par empreinte de commit, et il lance toujours les contrôles que CLAUDE.md annonce. Lecture du texte, pas
// d'analyse YAML (aucune dépendance de plus) : les motifs visés sont des lignes entières.
// shortcut: motifs sur le texte du workflow, pas sur son arbre YAML ; à remplacer par un analyseur YAML si le workflow
// gagne des jobs ou des matrices.

const racine = fileURLToPath(new URL('../..', import.meta.url))
const ci = readFileSync(racine + '.github/workflows/ci.yml', 'utf8')
const lignes = ci.split('\n')

test('la CI ne demande que la lecture du dépôt et ne se déclenche pas sur pull_request_target', () => {
  ok(/^permissions:\s*\r?\n {2}contents: read\s*$/m.test(ci), 'permissions: contents: read attendu au niveau du workflow')
  ok(!/:\s*write\b/.test(ci), 'aucune permission en écriture')
  ok(!ci.includes('pull_request_target'), 'pull_request_target donnerait des secrets au code d’une PR externe')
})

test('chaque action est épinglée par une empreinte de commit complète', () => {
  const actions = lignes.filter((ligne) => /^\s*-?\s*uses:/.test(ligne))
  ok(actions.length > 0, 'le workflow utilise au moins une action')
  for (const ligne of actions) {
    ok(/uses:\s*[\w./-]+@[0-9a-f]{40}(\s|$)/.test(ligne), `action non épinglée : ${ligne.trim()}`)
  }
})

test('la CI tourne sur Windows, sur main et sur les PR, avec typecheck, tests unitaires, build et smoke', () => {
  strictEqual((ci.match(/runs-on: windows-latest/g) ?? []).length, 2, 'deux jobs, tous deux sur windows-latest')
  ok(/^ {2}push:\s*\r?\n {4}branches: \[main\]/m.test(ci), 'push sur main')
  ok(/^ {2}pull_request:/m.test(ci), 'pull_request')
  const commandes = lignes.filter((ligne) => /^\s*(- )?run:\s*\S/.test(ligne)).map((ligne) => ligne.replace(/^\s*(- )?run:\s*/, '').trim())
  strictEqual(
    commandes.join(' | '),
    'npm ci | npx install-electron | npm run typecheck | npm run test:unit | npm run build | ' +
      'npm ci | npx install-electron | npm run test:smoke'
  )
})

// Un échec doit rester un échec : ni test rejoué jusqu'à passer, ni étape qui échoue sans arrêter le job.
test('aucune étape de la CI ne masque un échec', () => {
  // Commentaires retirés : une explication qui cite ces mots ne doit pas faire échouer le test.
  const sansCommentaires = ci.replace(/^\s*#.*$/gm, '')
  ok(!/continue-on-error/.test(sansCommentaires), 'continue-on-error rendrait un smoke rouge vert')
  ok(!/\bretries?\b/i.test(sansCommentaires), 'pas de nouvel essai automatique')
})

// Le cache du binaire d'Electron est rangé sous une clé qui nomme sa version : sans ce lien, une mise à jour
// d'Electron resservirait l'ancien binaire.
test('la clé du cache du binaire d’Electron porte la version épinglée dans package.json', () => {
  const version = JSON.parse(readFileSync(racine + 'arbalete-browser/package.json', 'utf8')).devDependencies.electron
  const cles = [...ci.matchAll(/CLE_CACHE_ELECTRON: (\S+)/g)].map((m) => m[1])
  strictEqual(cles.length, 2, 'une clé par job')
  for (const cle of cles) ok(cle.endsWith(`-${version}`), `clé ${cle} sans la version ${version}`)
})

test('la clé du cache d’Electron de release.yml porte aussi la version épinglée', () => {
  const version = JSON.parse(readFileSync(racine + 'arbalete-browser/package.json', 'utf8')).devDependencies.electron
  const release = readFileSync(racine + '.github/workflows/release.yml', 'utf8')
  const cles = [...release.matchAll(/CLE_CACHE_ELECTRON: (\S+)/g)].map((m) => m[1])
  strictEqual(cles.length, 1)
  ok(cles[0].endsWith(`-${version}`), `clé ${cles[0]} sans la version ${version}`)
})

// ARB-96 : le binaire d'Electron se télécharge après npm install ; en CI le workflow s'en charge (cache), le crochet
// ne doit donc rien faire (sinon il téléchargerait avant la restauration du cache).
test('postinstall télécharge Electron hors CI et ne fait rien en CI', () => {
  const scripts = JSON.parse(readFileSync(racine + 'arbalete-browser/package.json', 'utf8')).scripts
  strictEqual(scripts.postinstall, 'node scripts/postinstall.mjs')
  const resultat = spawnSync(process.execPath, [racine + 'arbalete-browser/scripts/postinstall.mjs'], {
    env: { ...process.env, CI: 'true' },
    encoding: 'utf8'
  })
  strictEqual(resultat.status, 0)
  strictEqual(resultat.stdout + resultat.stderr, '', 'aucune sortie : aucun téléchargement tenté')
})

// Value: protects=hors CI le crochet appelle l'installeur d'Electron et sort 0 sans bruit; fails_when=garde CI inversée, résolution ou lancement d'install.js cassés; why_new=le test précédent n'exerce que la branche CI; seam=none; no_claim=téléchargement réseau réel (le binaire est déjà là : les tests tournent sous Electron)
test('postinstall hors CI laisse un binaire déjà installé tel quel', () => {
  const { CI: _ci, ...sansCI } = process.env
  const resultat = spawnSync(process.execPath, [racine + 'arbalete-browser/scripts/postinstall.mjs'], {
    env: sansCI,
    encoding: 'utf8'
  })
  strictEqual(resultat.status, 0)
  strictEqual(resultat.stdout + resultat.stderr, '')
})

// Value: protects=sans electron installé le crochet avertit et sort 0 (npm install ne casse pas); fails_when=resolve ou spawn sort du try/catch ou l'avertissement disparaît; why_new=les autres tests n'exercent que la branche CI et le binaire présent; seam=none; no_claim=échec réel d'un téléchargement réseau (electron absent simulé par une copie du script hors de node_modules)
test('postinstall avertit sans échouer quand electron est introuvable', () => {
  const dossier = mkdtempSync(join(tmpdir(), 'arbalete-postinstall-'))
  try {
    const copie = join(dossier, 'postinstall.mjs')
    copyFileSync(racine + 'arbalete-browser/scripts/postinstall.mjs', copie)
    const { CI: _ci, ...sansCI } = process.env
    const resultat = spawnSync(process.execPath, [copie], { env: sansCI, encoding: 'utf8' })
    strictEqual(resultat.status, 0)
    ok(resultat.stderr.includes('npx install-electron'), 'avertissement attendu')
  } finally {
    rmSync(dossier, { recursive: true, force: true })
  }
})
