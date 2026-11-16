import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './Button'
import { FloatingPanel } from './FloatingPanel'
import { IconButton } from './IconButton'

// Notification brève (ARB-126), rendue dans la vue native d'un avis (le processus principal la pose au-dessus de la page
// et la retire au bout de sa durée). Un message, une icône, une action facultative et la croix de fermeture.
// Première utilisation : l'avis « pop-up bloquée » (ARB-108, PopupNoticeView).
export function Toast({ icone, message, action, onClose, testId }:
  { icone?: ReactNode; message: string; action?: { libelle: string; onClick: () => void }; onClose: () => void; testId?: string }) {
  return (
    <FloatingPanel className="toast" role="status" data-testid={testId}>
      {icone && <span className="toast-icon">{icone}</span>}
      <span className="toast-text">{message}</span>
      {action && <Button size="sm" variant="primary" onClick={action.onClick}>{action.libelle}</Button>}
      <IconButton title="Fermer" onClick={onClose}><X size={16}/></IconButton>
    </FloatingPanel>
  )
}
