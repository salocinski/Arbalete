import { useEffect, useState, type ReactNode } from 'react'
import { LARGEUR_ETENDUE_MAX, LARGEUR_ETENDUE_MIN, MODES_BARRE, actionsVersMode, modeBarre, type ModeBarre } from '../../../shared/barre'
import { DELAIS_ARCHIVAGE, LIBELLES_DELAI } from '../../../shared/archivage'
import { accueilValide } from '../../../shared/reglages'
import type { SidebarState, ThemeChoice } from '../../../shared/types'
import { useSettings, useTheme } from '../state'
import { ClearDataForm } from './ClearDataForm'
import { Overlay } from './Overlay'
import { SearchEngineSection } from './SearchEngineSection'
import { Button } from './ui/Button'
import { Input } from './ui/Input'

const THEMES: Array<[ThemeChoice, string]> = [['system', 'Système'], ['dark', 'Sombre'], ['light', 'Clair']]
const MODES: Record<ModeBarre, string> = { etendue: 'Étendue', compacte: 'Compacte', masquee: 'Masquée au survol' }

function Section({ titre, children }: { titre: string; children: ReactNode }) {
  return <section className="settings-section" aria-label={titre}><h3 className="settings-title">{titre}</h3>{children}</section>
}

function Choix<T extends string>({ label, options, valeur, onChoisir }: { label: string; options: Array<[T, string]>; valeur: T; onChoisir: (valeur: T) => void }) {
  return (
    <div className="engine-list engine-list--row" role="radiogroup" aria-label={label}>
      {options.map(([id, nom]) => (
        <button key={id} role="radio" className="engine-option" aria-checked={id === valeur} onClick={() => onChoisir(id)}>{nom}</button>
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

  // Page d'accueil : champ libre, enregistré par Entrée ou le bouton ; relu quand le processus principal la change.
  const [accueil, setAccueil] = useState('')
  useEffect(() => { setAccueil(reglages.accueil) }, [reglages.accueil])
  const accueilNormalise = accueilValide(accueil)
  const accueilEnregistre = accueilNormalise === accueilValide(reglages.accueil)
  const enregistrerAccueil = () => { if (accueilNormalise) void window.arbalete.setHomePage(accueilNormalise).catch(() => {}) }

  // Les actions de barre se jouent l'une après l'autre : chacune part de l'état laissé par la précédente.
  const choisirMode = async (mode: ModeBarre) => {
    for (const action of actionsVersMode(sidebar, mode)) await window.arbalete.setSidebar(action)
  }

  return (
    <Overlay centre onClose={onClose}>
      <div className="color-modal settings" role="dialog" aria-modal="true" aria-label="Paramètres">
        <div className="color-modal-title">Paramètres</div>

        <Section titre="Apparence">
          <Choix label="Thème" options={THEMES} valeur={choice} onChoisir={(theme) => void window.arbalete.setTheme(theme)} />
          <Choix label="Barre latérale" options={MODES_BARRE.map((mode): [ModeBarre, string] => [mode, MODES[mode]])} valeur={modeBarre(sidebar)} onChoisir={(mode) => void choisirMode(mode)} />
          <label className="settings-row">
            Largeur de la barre étendue
            <input type="range" min={LARGEUR_ETENDUE_MIN} max={LARGEUR_ETENDUE_MAX} step={4} value={sidebar.width} aria-valuetext={`${sidebar.width} pixels`}
              onChange={(event) => void window.arbalete.setSidebarWidth(Number(event.target.value))} />
          </label>
          <label className="settings-row settings-row--case">
            <input type="checkbox" checked={reglages.animationsReduites} onChange={(event) => void window.arbalete.setReducedMotion(event.target.checked)} />
            Réduire les animations
          </label>
        </Section>

        <Section titre="Moteur de recherche"><SearchEngineSection /></Section>

        <Section titre="Onglets">
          <Choix label="Archiver les onglets non épinglés après" options={DELAIS_ARCHIVAGE.map((heures): [string, string] => [String(heures), LIBELLES_DELAI[heures]])}
            valeur={String(reglages.archivageHeures)} onChoisir={(heures) => void window.arbalete.setArchiveDelay(Number(heures)).catch(() => {})} />
          <p className="settings-help">Un onglet épinglé, affiché ou qui joue du son n’est jamais archivé. Les onglets archivés se rouvrent depuis « Archive ».</p>
        </Section>

        <Section titre="Démarrage">
          <Input aria-label="Page d’accueil" placeholder="https://www.google.com" value={accueil} onChange={(event) => setAccueil(event.target.value)}
            error={accueil.trim() && !accueilNormalise ? 'Une adresse http ou https, sans identifiant.' : undefined}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) enregistrerAccueil() }} />
          <p className="settings-help">Ouverte par un nouvel onglet et au premier lancement.</p>
          <Button variant="primary" size="sm" disabled={!accueilNormalise || accueilEnregistre} onClick={enregistrerAccueil}>{accueilEnregistre ? 'Enregistré' : 'Enregistrer'}</Button>
        </Section>

        <Section titre="Téléchargements">
          <p className="settings-path" title={reglages.dossierTelechargements ?? undefined}>{reglages.dossierTelechargements ?? 'Dossier Téléchargements de Windows'}</p>
          <div className="settings-actions">
            <Button variant="secondary" size="sm" onClick={() => void window.arbalete.setDownloadFolder('choisir').catch(() => {})}>Choisir un dossier…</Button>
            <Button variant="secondary" size="sm" disabled={!reglages.dossierTelechargements} onClick={() => void window.arbalete.setDownloadFolder('defaut').catch(() => {})}>Par défaut</Button>
          </div>
        </Section>

        <Section titre="Confidentialité"><ClearDataForm /></Section>
      </div>
    </Overlay>
  )
}
