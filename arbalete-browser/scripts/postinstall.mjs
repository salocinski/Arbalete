// Télécharge le binaire d'Electron après `npm install` / `npm ci` (ARB-96) : depuis Electron 42 npm ne le fait plus.
// install.js d'Electron est idempotent (binaire déjà là : rien à faire). Sans effet en CI, où le workflow le télécharge
// lui-même depuis un cache ; un échec (hors ligne, electron absent d'un `npm ci --omit=dev`) avertit sans faire échouer
// l'installation des dépendances.
// shortcut: pas de délai maximal sur le téléchargement (un binaire de plus de 100 Mo peut être lent) ; à ajouter si une
// installation bloquée en réseau coupé devient un problème.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

if (process.env.CI) process.exit(0)

let echec = false
try {
  const installeur = createRequire(import.meta.url).resolve('electron/install.js')
  echec = spawnSync(process.execPath, [installeur], { stdio: 'inherit' }).status !== 0
} catch {
  echec = true
}
if (echec) console.warn('Binaire Electron non téléchargé : relancer `npx install-electron` avant `npm run dev`.')
