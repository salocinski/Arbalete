import { useEffect, useMemo, useState } from 'react'
import { Archive } from 'lucide-react'
import { grouperParJour } from '../../../shared/historique'
import type { ElementArchive } from '../../../shared/archivage'
import { Modal } from './ui/Modal'

// Panneau Archive (ARB-64) : modale de la couche d'overlays, sur le modèle de l'historique. Les onglets rangés par le délai
// de l'archivage, les plus récents d'abord, regroupés par jour ; un clic rouvre la page dans un nouvel onglet et l'en sort.
// Échap et le clic hors de la modale ferment l'overlay. Le délai se règle dans Paramètres.
export function ArchivePanel({ onClose }: { onClose: () => void }) {
  const [elements, setElements] = useState<ElementArchive[] | null>(null)
  useEffect(() => {
    let perime = false
    window.arbalete.listArchive().then(
      (liste) => {
        if (!perime) setElements(liste)
      },
      () => {
        if (!perime) setElements([])
      }
    )
    return () => {
      perime = true
    }
  }, [])
  const jours = useMemo(() => grouperParJour(elements ?? []), [elements])
  return (
    <Modal className="palette history" label="Onglets archivés" onClose={onClose}>
      <div className="palette-liste">
        {elements?.length === 0 && <p className="palette-vide">Aucun onglet archivé</p>}
        {jours.map(({ jour, visites }) => (
          <section key={jour} aria-label={jour}>
            <h3 className="history-day">{jour}</h3>
            {visites.map((element) => (
              <button
                key={element.id}
                type="button"
                className="suggestion"
                data-testid="archive-item"
                onClick={() => void window.arbalete.restoreArchived(element.id)}
              >
                <Archive size={14} className="muted-icon" aria-hidden="true" />
                <span className="suggestion-title">{element.titre || element.url}</span>
                <span className="suggestion-url">{element.titre ? element.url : ''}</span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </Modal>
  )
}
