import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Overlay } from '../Overlay'
import { FloatingPanel } from './FloatingPanel'
import { prochainFocus } from './focus'

const FOCALISABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

// Dialogue centré de la couche d'overlays (ARB-126) : cadre FloatingPanel, rôle dialog, focus piégé (Tab et Maj+Tab bouclent
// dans le panneau, la barre latérale du même document reste hors d'atteinte) et rendu à l'élément précédent à la fermeture.
// Échap et le clic à côté sont traités par la couche d'overlays et le processus principal.
export function Modal({ label, className, role = 'dialog', testId, onClose, children }:
  { label: string; className?: string; role?: 'dialog' | 'alertdialog'; testId?: string; onClose: () => void; children: ReactNode }) {
  const panneau = useRef<HTMLDivElement>(null)
  // Lu au rendu, avant que l'autoFocus d'un enfant ne déplace le focus : c'est l'élément qui a ouvert la modale.
  const [avant] = useState(() => document.activeElement as HTMLElement | null)

  useEffect(() => {
    // Sans élément qui ait pris le focus (autoFocus), le panneau le prend : le clavier reste dans la modale.
    if (!panneau.current?.contains(document.activeElement)) panneau.current?.focus()
    // Tab au niveau du document : le piège tient aussi quand l'élément focalisé disparaît (focus retombé sur body).
    const pieger = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !panneau.current) return
      const elements = [...panneau.current.querySelectorAll<HTMLElement>(FOCALISABLE)].filter((e) => e.getClientRects().length > 0)
      const cible = prochainFocus(elements.indexOf(document.activeElement as HTMLElement), elements.length, event.shiftKey)
      event.preventDefault()
      if (cible >= 0) elements[cible].focus()
    }
    document.addEventListener('keydown', pieger)
    return () => {
      document.removeEventListener('keydown', pieger)
      // Différé : sous StrictMode (dev) le cleanup précède une relance de l'effet, le panneau est alors encore monté.
      // oxlint-disable-next-line react-hooks/exhaustive-deps -- lecture volontaire de la valeur au moment du délai
      setTimeout(() => { if (!panneau.current) avant?.focus?.() })
    }
  }, [avant])

  return (
    <Overlay centre onClose={onClose}>
      <FloatingPanel ref={panneau} className={className} role={role} aria-modal="true" aria-label={label} data-testid={testId} tabIndex={-1}>
        {children}
      </FloatingPanel>
    </Overlay>
  )
}
