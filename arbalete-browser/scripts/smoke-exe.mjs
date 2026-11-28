// Smoke de l'exe empaqueté (ARB-163) : lance Arbalete.exe avec les fuses posés (ARB-137) et vérifie qu'il démarre
// pour de bon : une fenêtre s'ouvre et le processus tient, RunAsNode et l'inspecteur sont bien coupés.
// Usage : node scripts/smoke-exe.mjs <chemin de Arbalete.exe> (lancé par ci.yml sur un build --dir, et par release.yml
// sur l'exe signé).
// shortcut: Playwright ne peut pas piloter cet exe (inspection coupée par les fuses), la preuve est donc la fenêtre
// native du processus ; pas de contrôle du contenu de la page, à reprendre si un pilotage d'exe empaqueté devient possible.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { connect, createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

if (!process.argv[2]) {
  console.error('Usage : node scripts/smoke-exe.mjs <Arbalete.exe> (argument manquant)')
  process.exit(1)
}
const exe = resolve(process.argv[2])
if (!existsSync(exe)) {
  console.error(`Exe introuvable : ${exe}`)
  process.exit(1)
}

const DELAI_FENETRE_MS = 30_000
const pause = (ms) => new Promise((r) => setTimeout(r, ms))
const tuer = (pid) => spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })

// Port libre pour l'inspecteur : --inspect=0 en choisirait un qu'on ne pourrait pas sonder.
const portLibre = () =>
  new Promise((resolvePort, rejeter) => {
    const s = createServer()
    s.on('error', rejeter)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => resolvePort(port))
    })
  })
const portOuvert = (port) =>
  new Promise((r) => {
    const c = connect({ port, host: '127.0.0.1' })
    c.setTimeout(2000, () => (c.destroy(), r(false)))
    c.on('connect', () => (c.destroy(), r(true)))
    c.on('error', () => r(false))
  })

const enfants = []
const profils = []
// ARBALETE_PROFIL_TEST est ignorée dans l'app empaquetée : le profil jetable passe par le commutateur de Chromium.
const lancer = (args, env = {}) => {
  const profil = mkdtempSync(join(tmpdir(), 'arbalete-smoke-exe-'))
  profils.push(profil)
  const enfant = spawn(exe, [`--user-data-dir=${profil}`, ...args], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  enfants.push(enfant)
  const etat = { texte: '', erreur: null, enfant }
  for (const flux of [enfant.stdout, enfant.stderr]) flux.on('data', (d) => (etat.texte += d))
  // Exe bloqué (antivirus, droits) : l'événement est gardé et relevé par la boucle, il ne fait pas planter Node.
  enfant.on('error', (e) => (etat.erreur = e))
  etat.fini = new Promise((r) => enfant.on('exit', (code) => r(code)))
  return etat
}
const fenetre = (pid) =>
  spawnSync(
    'powershell',
    ['-NoProfile', '-Command', `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).MainWindowHandle`],
    { encoding: 'utf8', timeout: 10_000 }
  ).stdout?.trim() ?? ''
const verifierVivant = (app, quand) => {
  if (app.erreur) throw new Error(`L'exe n'a pas pu être lancé : ${app.erreur.message}`)
  if (app.enfant.exitCode !== null)
    throw new Error(`L'exe s'est arrêté ${quand} (code ${app.enfant.exitCode}) : ${app.texte.slice(0, 500)}`)
}

let erreur = null
try {
  // 1. RunAsNode coupé : l'exe ne doit pas se comporter comme Node, il démarre l'application (donc reste vivant).
  const noeud = lancer(['-e', "console.log('RUNASNODE')"], { ELECTRON_RUN_AS_NODE: '1' })
  const issue = await Promise.race([noeud.fini, pause(8000).then(() => 'vivant')])
  if (noeud.erreur) throw new Error(`L'exe n'a pas pu être lancé : ${noeud.erreur.message}`)
  if (noeud.texte.includes('RUNASNODE')) throw new Error("RunAsNode actif : l'exe exécute du JavaScript Node")
  if (issue !== 'vivant')
    throw new Error(`Avec ELECTRON_RUN_AS_NODE l'exe s'est arrêté (code ${issue}) au lieu de démarrer l'application`)
  tuer(noeud.enfant.pid)

  // 2. Démarrage normal : une fenêtre s'ouvre, le processus tient 5 s de plus, l'inspecteur reste fermé.
  const portInspecteur = await portLibre()
  const app = lancer([`--inspect=${portInspecteur}`])
  const echeance = Date.now() + DELAI_FENETRE_MS
  let ouverte = false
  while (!ouverte && Date.now() < echeance) {
    await pause(500)
    verifierVivant(app, 'au démarrage')
    ouverte = /^[1-9]\d*$/.test(fenetre(app.enfant.pid))
  }
  if (!ouverte) throw new Error(`Aucune fenêtre ouverte en ${DELAI_FENETRE_MS / 1000} s`)
  await pause(5000)
  verifierVivant(app, "après l'ouverture de la fenêtre")
  // Le fuse EnableNodeCliInspectArguments coupe --inspect : Node écrirait « Debugger listening on ws://… ».
  // Message sur les pipes, ou port d'inspection ouvert (les pipes d'un exe GUI ne sont pas une preuve à elles seules).
  if (/Debugger listening/.test(app.texte) || (await portOuvert(portInspecteur)))
    throw new Error(`Inspecteur actif malgré les fuses (port ${portInspecteur}) : ` + app.texte.slice(0, 300))
  console.log("Smoke de l'exe empaqueté : fenêtre ouverte, RunAsNode et inspecteur coupés")
} catch (e) {
  erreur = e
}
// Quoi qu'il arrive, aucun processus ne reste (sur Windows les enfants survivent à leur parent).
// Un processus déjà terminé n'est pas visé : son pid peut avoir été réattribué.
for (const e of enfants) if (e.pid && e.exitCode === null && e.signalCode === null) tuer(e.pid)
// Nettoyage au mieux : Windows tient encore les fichiers un instant après le kill, le dossier est sous le temp du poste.
await pause(1500)
for (const p of profils) {
  try {
    rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
  } catch {}
}
if (erreur) {
  console.error("Smoke de l'exe empaqueté en échec : " + erreur.message)
  process.exit(1)
}
