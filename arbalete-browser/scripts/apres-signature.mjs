// Après la signature de l'installeur par SignPath (ARB-76, release.yml) : met `latest.yml` d'accord avec le fichier signé
// (sha512 et taille) et supprime le blockmap de l'installeur non signé. Voir src/shared/signature.ts.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { majLatest } from '../src/shared/signature.ts'

/** `dossier` finit par un séparateur. Lève s'il n'y a pas exactement un installeur (la CI part d'un dépôt neuf, un `release/` local en garde d'anciens). */
export function traiter(dossier) {
  const installeurs = readdirSync(dossier).filter((f) => /^Arbalete-Setup-.+\.exe$/.test(f))
  if (installeurs.length !== 1)
    throw new Error(`Un seul installeur attendu dans ${dossier}, trouvé : ${installeurs.join(', ') || 'aucun'}`)
  const octets = readFileSync(dossier + installeurs[0])
  const latest = dossier + 'latest.yml'
  writeFileSync(
    latest,
    majLatest(readFileSync(latest, 'utf8'), createHash('sha512').update(octets).digest('base64'), octets.length)
  )
  rmSync(dossier + installeurs[0] + '.blockmap', { force: true })
  return `latest.yml mis à jour pour ${installeurs[0]} (${octets.length} octets)`
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    console.log(traiter(fileURLToPath(new URL('../release/', import.meta.url))))
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
