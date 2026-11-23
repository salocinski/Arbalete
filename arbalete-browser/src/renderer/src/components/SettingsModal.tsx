import { useEffect, useState, type ReactNode } from 'react'
import {
  LARGEUR_ETENDUE_MAX,
  LARGEUR_ETENDUE_MIN,
  MODES_BARRE,
  actionsVersMode,
  modeBarre,
  type ModeBarre
} from '../../../shared/barre'
import { DELAIS_ARCHIVAGE, LIBELLES_DELAI } from '../../../shared/archivage'
import { DELAIS_VEILLE, LIBELLES_VEILLE, type MemoireOnglets } from '../../../shared/veille'
import { accueilValide } from '../../../shared/reglages'
import type { EtatMiseAJour } from '../../../shared/miseAJour'
import { resumeImport } from '../../../shared/sauvegarde'
import type { ApercuImport, SidebarState, ThemeChoice } from '../../../shared/types'
import { useSettings, useTheme } from '../state'
import { ClearDataForm } from './ClearDataForm'
import { Modal } from './ui/Modal'
import { SearchEngineSection } from './SearchEngineSection'
import { ExtensionsSection } from './ExtensionsSection'
import { Button } from './ui/Button'
import { Input } from './ui/Input'

const THEMES: Array<[ThemeChoice, string]> = [
  ['system', 'Système'],
  ['dark', 'Sombre'],
  ['light', 'Clair']
]
const MODES: Record<ModeBarre, string> = { etendue: 'Étendue', compacte: 'Compacte', masquee: 'Masquée au survol' }

function Section({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="settings-section" aria-label={titre}>
      <h3 className="settings-title">{titre}</h3>
      {children}
    </section>
  )
}

function Choix<T extends string>({
  label,
  options,
  valeur,
  onChoisir
}: {
  label: string
  options: Array<[T, string]>
  valeur: T
  onChoisir: (valeur: T) => void
}) {
  return (
    <div className="engine-list engine-list--row" role="radiogroup" aria-label={label}>
      {options.map(([id, nom]) => (
        <button
          key={id}
          role="radio"
          className="engine-option"
          aria-checked={id === valeur}
          onClick={() => onChoisir(id)}
        >
          {nom}
        </button>
      ))}
    </div>
  )
}

// Page Paramètres (ARB-57, EP-11) : modale de la couche d'overlays, ouverte par le bouton « Paramètres » de la barre
// latérale. Thème, barre latérale et animations s'appliquent à chaque clic ; le moteur, la page d'accueil et le dossier
// de téléchargement passent par le processus principal, qui valide chaque valeur. Échap et le clic hors de la modale la ferment.
export function SettingsModal({ sidebar, onClose }: { sidebar: SidebarState; onClose: () => void }) {
  const { choice } = useTheme()
  const reglages = useSettings()

  // Mémoire des pages (ARB-78) : mesurée à l'ouverture puis toutes les 3 s, pour voir l'effet d'une mise en veille.
  const [memoire, setMemoire] = useState<MemoireOnglets | null>(null)
  useEffect(() => {
    let perime = false
    const mesurer = () =>
      window.arbalete.getMemory().then(
        (mesure) => {
          if (!perime) setMemoire(mesure)
        },
        () => {}
      )
    void mesurer()
    const minuteur = setInterval(() => void mesurer(), 3000)
    return () => {
      perime = true
      clearInterval(minuteur)
    }
  }, [])

  // Navigateur par défaut (ARB-80) : relu à l'ouverture et quand la fenêtre reprend le focus (retour des paramètres Windows).
  const [navigateur, setNavigateur] = useState<string | null>(null)
  useEffect(() => {
    let perime = false
    const lire = () =>
      window.arbalete.getDefaultBrowser().then(
        (nom) => {
          if (!perime) setNavigateur(nom)
        },
        () => {}
      )
    void lire()
    window.addEventListener('focus', lire)
    return () => {
      perime = true
      window.removeEventListener('focus', lire)
    }
  }, [])

  // Mises à jour (ARB-77) : état lu à l'ouverture, puis suivi par le processus principal.
  const [maj, setMaj] = useState<EtatMiseAJour | null>(null)
  useEffect(() => {
    let perime = false
    void window.arbalete.getUpdateState().then(
      (etat) => {
        if (!perime) setMaj(etat)
      },
      () => {}
    )
    const retirer = window.arbalete.onUpdateState(setMaj)
    return () => {
      perime = true
      retirer()
    }
  }, [])

  // Page d'accueil : champ libre, enregistré par Entrée ou le bouton ; relu quand le processus principal la change.
  const [accueil, setAccueil] = useState('')
  useEffect(() => {
    setAccueil(reglages.accueil)
  }, [reglages.accueil])
  const accueilNormalise = accueilValide(accueil)
  const accueilEnregistre = accueilNormalise === accueilValide(reglages.accueil)
  const enregistrerAccueil = () => {
    if (accueilNormalise) void window.arbalete.setHomePage(accueilNormalise).catch(() => {})
  }

  // Export et import des données (ARB-79) : un seul à la fois ; l'annulation de la boîte ne laisse aucun message.
  const [donnees, setDonnees] = useState({ enCours: false, message: '' })
  // ARB-146 : sauvegarde complète à l'export, et aperçu du fichier choisi, à confirmer avant toute restauration.
  const [sauvegardeComplete, setSauvegardeComplete] = useState(false)
  const [apercu, setApercu] = useState<ApercuImport | null>(null)
  const lancerDonnees = (action: () => Promise<string | null | undefined | false | 0>) => {
    setDonnees({ enCours: true, message: '' })
    action().then(
      (message) => setDonnees({ enCours: false, message: message || '' }),
      (erreur: unknown) =>
        setDonnees({
          enCours: false,
          message: `Échec : ${erreur instanceof Error ? erreur.message.replace(/^Error invoking remote method '[^']*': (Error: )?/, '') : 'erreur inconnue'}`
        })
    )
  }

  // Les actions de barre se jouent l'une après l'autre : chacune part de l'état laissé par la précédente.
  const choisirMode = async (mode: ModeBarre) => {
    for (const action of actionsVersMode(sidebar, mode)) await window.arbalete.setSidebar(action)
  }

  return (
    <Modal className="color-modal settings" label="Paramètres" onClose={onClose}>
      <div className="color-modal-title">Paramètres</div>

      <Section titre="Apparence">
        <Choix
          label="Thème"
          options={THEMES}
          valeur={choice}
          onChoisir={(theme) => void window.arbalete.setTheme(theme)}
        />
        <Choix
          label="Barre latérale"
          options={MODES_BARRE.map((mode): [ModeBarre, string] => [mode, MODES[mode]])}
          valeur={modeBarre(sidebar)}
          onChoisir={(mode) => void choisirMode(mode)}
        />
        <label className="settings-row">
          Largeur de la barre étendue
          <input
            type="range"
            min={LARGEUR_ETENDUE_MIN}
            max={LARGEUR_ETENDUE_MAX}
            step={4}
            value={sidebar.width}
            aria-valuetext={`${sidebar.width} pixels`}
            onChange={(event) => void window.arbalete.setSidebarWidth(Number(event.target.value))}
          />
        </label>
        <label className="settings-row settings-row--case">
          <input
            type="checkbox"
            checked={reglages.animationsReduites}
            onChange={(event) => void window.arbalete.setReducedMotion(event.target.checked)}
          />
          Réduire les animations
        </label>
      </Section>

      <Section titre="Moteur de recherche">
        <SearchEngineSection />
      </Section>

      <Section titre="Onglets">
        <Choix
          label="Archiver les onglets non épinglés après"
          options={DELAIS_ARCHIVAGE.map((heures): [string, string] => [String(heures), LIBELLES_DELAI[heures]])}
          valeur={String(reglages.archivageHeures)}
          onChoisir={(heures) => void window.arbalete.setArchiveDelay(Number(heures)).catch(() => {})}
        />
        <p className="settings-help">
          Un onglet épinglé, affiché ou qui joue du son n’est jamais archivé. Les onglets archivés se rouvrent depuis «
          Archive ».
        </p>
        <Choix
          label="Mettre en veille les onglets laissés de côté après"
          options={DELAIS_VEILLE.map((minutes): [string, string] => [String(minutes), LIBELLES_VEILLE[minutes]])}
          valeur={String(reglages.veilleMinutes)}
          onChoisir={(minutes) => void window.arbalete.setSleepDelay(Number(minutes)).catch(() => {})}
        />
        <p className="settings-help">
          Un onglet en veille libère sa mémoire et recharge sa page quand on l’affiche (Précédent et le défilement sont
          perdus). L’onglet affiché ou qui joue du son reste éveillé.
        </p>
        <p className="settings-help" aria-live="polite">
          {memoire
            ? `Mémoire des pages : ${memoire.mo} Mo, ${memoire.enVeille} onglet(s) sans page chargée.`
            : 'Mémoire des pages : mesure en cours…'}
        </p>
      </Section>

      <Section titre="Extensions">
        <ExtensionsSection />
      </Section>

      <Section titre="Démarrage">
        <Input
          aria-label="Page d’accueil"
          placeholder="https://www.google.com"
          value={accueil}
          onChange={(event) => setAccueil(event.target.value)}
          error={accueil.trim() && !accueilNormalise ? 'Une adresse http ou https, sans identifiant.' : undefined}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) enregistrerAccueil()
          }}
        />
        <p className="settings-help">Ouverte par un nouvel onglet et au premier lancement.</p>
        <Button
          variant="primary"
          size="sm"
          disabled={!accueilNormalise || accueilEnregistre}
          onClick={enregistrerAccueil}
        >
          {accueilEnregistre ? 'Enregistré' : 'Enregistrer'}
        </Button>
      </Section>

      <Section titre="Téléchargements">
        <p className="settings-path" title={reglages.dossierTelechargements ?? undefined}>
          {reglages.dossierTelechargements ?? 'Dossier Téléchargements de Windows'}
        </p>
        <div className="settings-actions">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void window.arbalete.setDownloadFolder('choisir').catch(() => {})}
          >
            Choisir un dossier…
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!reglages.dossierTelechargements}
            onClick={() => void window.arbalete.setDownloadFolder('defaut').catch(() => {})}
          >
            Par défaut
          </Button>
        </div>
      </Section>

      <Section titre="Navigateur par défaut">
        <p className="settings-help" aria-live="polite">
          {navigateur ? `Navigateur actuel : ${navigateur}.` : 'Navigateur actuel inconnu.'}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void window.arbalete.openDefaultApps().catch(() => {})}>
          Ouvrir les paramètres Windows…
        </Button>
        <p className="settings-help">
          Windows laisse ce choix à l’utilisateur : choisissez Arbalète pour http et https. Les liens des autres
          applications s’ouvriront alors dans un onglet.
        </p>
      </Section>

      <Section titre="Mises à jour">
        <p className="settings-help" aria-live="polite">
          {maj ? libelleMiseAJour(maj) : 'État inconnu.'}
        </p>
        <div className="settings-actions">
          {maj?.etat === 'prete' ? (
            <Button variant="secondary" size="sm" onClick={() => void window.arbalete.installUpdate().catch(() => {})}>
              Redémarrer et installer
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={!maj || maj.etat === 'inactive' || maj.etat === 'recherche' || maj.etat === 'telechargement'}
              onClick={() => void window.arbalete.checkForUpdates().catch(() => {})}
            >
              Rechercher une mise à jour
            </Button>
          )}
        </div>
        <p className="settings-help">
          Arbalète cherche une nouvelle version au démarrage puis toutes les 6 heures, la télécharge en arrière-plan et
          l’installe à la fermeture.
        </p>
      </Section>

      <Section titre="Sauvegarde des données">
        <label className="settings-row settings-row--case">
          <input
            type="checkbox"
            checked={sauvegardeComplete}
            disabled={donnees.enCours || apercu !== null}
            onChange={(event) => setSauvegardeComplete(event.target.checked)}
          />
          Sauvegarde complète (profils, permissions des sites, onglets ouverts, archive)
        </label>
        <div className="settings-actions">
          <Button
            variant="secondary"
            size="sm"
            disabled={donnees.enCours || apercu !== null}
            onClick={() =>
              lancerDonnees(() =>
                window.arbalete
                  .exportData(sauvegardeComplete)
                  .then(
                    (n) =>
                      n &&
                      `Exporté : ${n.favoris} favori(s), ${n.pages} page(s) d’historique${
                        sauvegardeComplete
                          ? `, ${n.profils} profil(s), ${n.permissions} permission(s), ${n.archive} onglet(s) archivé(s)`
                          : ''
                      }.`
                  )
              )
            }
          >
            Exporter…
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={donnees.enCours || apercu !== null}
            onClick={() =>
              lancerDonnees(() =>
                window.arbalete.previewImport().then((a) => {
                  setApercu(a)
                  return null
                })
              )
            }
          >
            Importer…
          </Button>
        </div>
        {apercu && (
          <div className="settings-help" role="group" aria-label="Aperçu de la restauration">
            <p>
              {apercu.complet ? 'Sauvegarde complète' : 'Export simple'}
              {apercu.exporteLe > 0 ? ` du ${new Date(apercu.exporteLe).toLocaleDateString('fr-FR')}` : ''}. Cette
              restauration ajoutera : {resumeImport(apercu.ajouts)}.
            </p>
            {apercu.ajouts.reglages && <p>Les réglages du fichier remplaceront vos réglages actuels.</p>}
            {apercu.ajouts.conflits > 0 && (
              <p>
                {apercu.ajouts.conflits} permission(s) de site déjà réglée(s) autrement sont gardées telles quelles.
              </p>
            )}
            <div className="settings-actions">
              <Button
                variant="primary"
                size="sm"
                disabled={donnees.enCours}
                onClick={() => {
                  setApercu(null)
                  lancerDonnees(() => window.arbalete.confirmImport().then((b) => `Restauré : ${resumeImport(b)}.`))
                }}
              >
                Restaurer
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setApercu(null)
                  void window.arbalete.cancelImport().catch(() => {})
                }}
              >
                Annuler
              </Button>
            </div>
          </div>
        )}
        <p className="settings-help">
          Fichier JSON non chiffré, à garder en lieu sûr. Les cookies, mots de passe et données des sites n’en font
          jamais partie : il faudra vous reconnecter après une restauration. La restauration ajoute sans rien supprimer,
          sauf les réglages du fichier ; les autorisations de site du fichier ne sont pas importées (seuls les refus),
          elles se redemandent ; les onglets ouverts qu’il contient arrivent dans l’archive.
        </p>
        <p className="settings-help" role="status" aria-live="polite">
          {donnees.message}
        </p>
      </Section>

      <Section titre="Confidentialité">
        <ClearDataForm />
      </Section>
    </Modal>
  )
}

function libelleMiseAJour(maj: EtatMiseAJour): string {
  const version = `Version installée : ${maj.version}.`
  switch (maj.etat) {
    case 'inactive':
      return `${version} Les mises à jour ne sont actives que dans l’application installée.`
    case 'recherche':
      return `${version} Recherche en cours…`
    case 'telechargement':
      return `${version} Téléchargement de la version ${maj.nouvelle} : ${maj.pourcent ?? 0} %.`
    case 'prete':
      return `${version} La version ${maj.nouvelle} est prête : elle s’installe à la fermeture, ou tout de suite.`
    case 'erreur':
      return `${version} La recherche a échoué (réseau ou serveur indisponible) ; nouvel essai dans 6 heures.`
    default:
      return `${version} Arbalète est à jour.`
  }
}
