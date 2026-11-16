import type { EtatMiseAJour } from '../shared/miseAJour.ts'
import { versionAffichee } from '../shared/version.ts'

// Mises à jour automatiques (ARB-77) : electron-updater lit `latest.yml` dans la dernière Release GitHub, télécharge
// l'installeur en arrière-plan (sha512 vérifié) et l'installe à la fermeture ; `installer` le fait tout de suite.
// shortcut: installeur non signé (ARB-76 à faire) : seul le sha512 du `latest.yml` protège la mise à jour, donc le compte
// GitHub qui publie ; ajouter `publisherName` à electron-builder.yml (win) dès que le code est signé.

// Ce que ce module utilise d'`autoUpdater`, pour le remplacer dans les tests.
export interface MiseAJourUpdater {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowDowngrade: boolean
  allowPrerelease: boolean
  on(evenement: string, ecouteur: (...args: any[]) => void): unknown
  checkForUpdates(): Promise<unknown>
  quitAndInstall(silencieux: boolean, relancer: boolean): void
}

const PREMIERE_VERIFICATION_MS = 30_000
const INTERVALLE_MS = 6 * 3_600_000

export function creerMiseAJour(options: { updater: MiseAJourUpdater; versionSemver: string; actif: boolean; diffuser: (etat: EtatMiseAJour) => void }) {
  const { updater, actif, diffuser } = options
  const version = versionAffichee(options.versionSemver)
  let etat: EtatMiseAJour = { etat: actif ? 'a-jour' : 'inactive', version }
  const changer = (suivant: Omit<EtatMiseAJour, 'version'>) => {
    etat = { ...suivant, version }
    diffuser(etat)
  }

  if (actif) {
    updater.autoDownload = true
    updater.autoInstallOnAppQuit = true
    updater.allowDowngrade = false
    updater.allowPrerelease = false
    updater.on('checking-for-update', () => changer({ etat: 'recherche' }))
    updater.on('update-not-available', () => changer({ etat: 'a-jour' }))
    updater.on('update-available', (info: { version: string }) => changer({ etat: 'telechargement', nouvelle: versionAffichee(info.version), pourcent: 0 }))
    updater.on('download-progress', (p: { percent: number }) => {
      if (etat.etat === 'telechargement') changer({ etat: 'telechargement', nouvelle: etat.nouvelle, pourcent: Math.max(0, Math.min(100, Math.round(p.percent))) })
    })
    updater.on('update-downloaded', (info: { version: string }) => changer({ etat: 'prete', nouvelle: versionAffichee(info.version) }))
    updater.on('error', (erreur: unknown) => {
      console.error('Mise à jour :', erreur)
      if (etat.etat !== 'prete') changer({ etat: 'erreur' }) // le fichier téléchargé s'installera quand même
    })
  }

  return {
    etat: () => etat,
    // Sans effet hors application empaquetée, ou si une recherche, un téléchargement ou une mise à jour prête est en cours.
    async verifier(): Promise<void> {
      if (!actif || etat.etat === 'recherche' || etat.etat === 'telechargement' || etat.etat === 'prete') return
      try {
        await updater.checkForUpdates()
      } catch (erreur) {
        if (etat.etat !== 'erreur') {
          console.error('Mise à jour :', erreur)
          changer({ etat: 'erreur' })
        }
      }
    },
    // Ferme l'application, installe sans fenêtre d'installeur et relance ; seulement si la mise à jour est téléchargée.
    installer(): void {
      if (actif && etat.etat === 'prete') updater.quitAndInstall(true, true)
    },
    // Première vérification peu après le démarrage (la première fenêtre n'attend pas), puis toutes les 6 h.
    planifier(): void {
      if (!actif) return
      setTimeout(() => void this.verifier(), PREMIERE_VERIFICATION_MS).unref()
      setInterval(() => void this.verifier(), INTERVALLE_MS).unref()
    }
  }
}
