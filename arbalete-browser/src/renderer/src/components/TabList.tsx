import { useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Folder, Pencil, X } from 'lucide-react'
import { TabItem, TYPE_GLISSE } from './TabItem'
import { IconButton } from './ui/IconButton'
import { Input } from './ui/Input'
import {
  LONGUEUR_MAX_NOM_DOSSIER_ONGLET,
  sectionsParDossier,
  type DossierOnglet
} from '../../../shared/dossiersOnglets'
import type { BrowserState } from '../../../shared/types'

// Nom d'un dossier (ARB-69) : Entrée ou la perte du focus valide, Échap annule, un nom vide ne se valide pas ; le processus
// principal revalide longueur et contenu.
function ChampNomDossier({
  initial,
  onValider,
  onAnnuler
}: {
  initial: string
  onValider: (nom: string) => void
  onAnnuler: () => void
}) {
  const [nom, setNom] = useState(initial)
  const fini = useRef(false) // Échap, Entrée puis blur : une seule issue
  const valider = () => {
    if (fini.current) return
    fini.current = true
    if (nom.trim()) onValider(nom.trim())
    else onAnnuler()
  }
  return (
    <Input
      autoFocus
      value={nom}
      maxLength={LONGUEUR_MAX_NOM_DOSSIER_ONGLET}
      aria-label="Nom du dossier"
      onFocus={(event) => event.target.select()}
      onChange={(event) => setNom(event.target.value)}
      onBlur={valider}
      onKeyDown={(event) => {
        // Les touches du champ ne doivent pas atteindre les raccourcis de la page ni fermer la barre.
        event.stopPropagation()
        if (event.key === 'Enter') valider()
        if (event.key === 'Escape') {
          fini.current = true
          onAnnuler()
        }
      }}
    />
  )
}

// En-tête d'un dossier : un clic le replie ou le déplie, le double-clic ou le crayon le renomme, un onglet déposé dessus y entre.
function EnTeteDossier({
  dossier,
  nombre,
  renomme,
  onRenommer,
  onFinRenommer
}: {
  dossier: DossierOnglet
  nombre: number
  renomme: boolean
  onRenommer: () => void
  onFinRenommer: () => void
}) {
  return (
    <div
      className="folder-header"
      data-folder-id={dossier.id}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        const id = event.dataTransfer.getData(TYPE_GLISSE)
        if (id) void window.arbalete.setTabFolder(id, dossier.id)
      }}
    >
      {renomme ? (
        <ChampNomDossier
          initial={dossier.nom}
          onAnnuler={onFinRenommer}
          onValider={(nom) => {
            window.arbalete.renameTabFolder(dossier.id, nom).catch(() => {})
            onFinRenommer()
          }}
        />
      ) : (
        <>
          <button
            className="folder-toggle"
            aria-expanded={!dossier.replie}
            title={dossier.replie ? 'Déplier le dossier' : 'Replier le dossier'}
            onClick={() => void window.arbalete.toggleTabFolder(dossier.id)}
            onDoubleClick={onRenommer}
          >
            {dossier.replie ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            <Folder size={14} />
            <span className="folder-name">{dossier.nom}</span>
            <span className="folder-count">{nombre}</span>
          </button>
          <span className="folder-actions">
            <IconButton size="sm" title="Renommer le dossier" onClick={onRenommer}>
              <Pencil size={12} />
            </IconButton>
            <IconButton
              size="sm"
              title="Supprimer le dossier (ses onglets restent ouverts)"
              onClick={() => void window.arbalete.deleteTabFolder(dossier.id)}
            >
              <X size={14} />
            </IconButton>
          </span>
        </>
      )}
    </div>
  )
}

// onMenu : clic droit sur un onglet, avec la position du pointeur dans la vue (menu de l'onglet, ARB-39).
// groupe : les onglets épinglés (ARB-64) ou ceux du jour ; sans groupe, tous. Le déplacement vise l'index de l'onglet dans
// la liste complète de l'espace, épinglés en tête.
// Dossiers (ARB-69) : seuls les onglets du jour y entrent. Ils s'affichent d'abord, chacun avec ses onglets, puis les onglets sans
// dossier ; déposer un onglet sur un autre le range dans le dossier de celui-ci (ou à la racine). renomme / onRenommer : le dossier
// dont le nom est en cours de saisie, tenu par la barre pour ouvrir la saisie dès la création.
export function TabList({
  state,
  onMenu,
  groupe,
  renomme = null,
  onRenommer
}: {
  state: BrowserState
  onMenu?: (tabId: string, x: number, y: number) => void
  groupe?: 'epingles' | 'jour'
  renomme?: number | null
  onRenommer?: (id: number | null) => void
}) {
  const liste = useRef<HTMLDivElement>(null)
  const [tenu, setTenu] = useState<string | null>(null) // onglet en cours de glissement (ARB-68)
  const positions = useRef(new Map<string, number>())
  // Les positions ne changent que si la liste des identifiants change, pas à chaque mise à jour de titre ou d'état.
  const affiches = groupe ? state.tabs.filter((tab) => !!tab.pinned === (groupe === 'epingles')) : state.tabs
  const sections =
    groupe === 'jour'
      ? sectionsParDossier(affiches, state.folders, state.activeTabId)
      : [{ dossier: null, onglets: affiches }]
  const cleOrdre = sections
    .map((section) => `${section.dossier?.id ?? ''}:${section.onglets.map((tab) => tab.id).join('.')}`)
    .join()

  // Réorganisation animée (DESIGN.md, Motion : 160 ms) : technique FLIP, chaque onglet déplacé part de son ancienne
  // position et glisse vers la nouvelle. prefers-reduced-motion coupe la transition (styles.css).
  useLayoutEffect(() => {
    const apres = new Map<string, number>()
    for (const el of liste.current?.querySelectorAll<HTMLElement>('.tab-item') ?? []) {
      const id = el.dataset.tabId!
      const haut = el.offsetTop
      apres.set(id, haut)
      const avant = positions.current.get(id)
      if (avant === undefined || avant === haut) continue
      el.style.transition = 'none'
      el.style.transform = `translateY(${avant - haut}px)`
      el.getBoundingClientRect() // force le calcul de style avant de lancer la transition
      el.style.transition = ''
      el.style.transform = ''
    }
    positions.current = apres
  }, [cleOrdre])

  const onglet = (tab: BrowserState['tabs'][number]) => {
    const index = state.tabs.indexOf(tab)
    return (
      <TabItem
        key={tab.id}
        tab={tab}
        active={tab.id === state.activeTabId}
        drag={{
          dragging: tenu === tab.id,
          onDragStart: () => setTenu(tab.id),
          onDragEnd: () => setTenu(null),
          onDrop: (id) => {
            // Déposer un onglet sur l'onglet actif forme la vue partagée (ARB-148) ; un onglet déjà partagé n'y quitte pas la vue.
            if (id && tab.id === state.activeTabId && id !== tab.id) {
              if (!state.split?.includes(id)) void window.arbalete.tabAction(id, 'vue-partagee')
            } else if (id) {
              if (groupe === 'jour') void window.arbalete.setTabFolder(id, tab.folder ?? null)
              void window.arbalete.moveTab(id, index)
            }
            setTenu(null)
          }
        }}
        onSelect={() => void window.arbalete.activateTab(tab.id)}
        onClose={() => void window.arbalete.closeTab(tab.id)}
        onMenu={(x, y) => onMenu?.(tab.id, x, y)}
      />
    )
  }

  return (
    <div className="tab-list" ref={liste}>
      {sections.map(({ dossier, onglets }) =>
        dossier ? (
          <div className="folder-section" key={`dossier-${dossier.id}`}>
            <EnTeteDossier
              dossier={dossier}
              nombre={affiches.filter((tab) => tab.folder === dossier.id).length}
              renomme={renomme === dossier.id}
              onRenommer={() => onRenommer?.(dossier.id)}
              onFinRenommer={() => onRenommer?.(null)}
            />
            {onglets.length > 0 && <div className="folder-tabs">{onglets.map(onglet)}</div>}
          </div>
        ) : (
          onglets.map(onglet)
        )
      )}
    </div>
  )
}
