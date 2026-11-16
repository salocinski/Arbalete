import { phraseDemande, type DemandePermission } from '../../../shared/permissions'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'

// Invite de permission d'un site (ARB-15), modale de la couche d'overlays. Autoriser ou Refuser est mémorisé pour le site ;
// Échap ou un clic à côté refuse cette fois seulement. Refuser prend le focus : une touche Entrée distraite n'accorde rien.
export function PermissionModal({ demande, onClose }: { demande: DemandePermission; onClose: () => void }) {
  const repondre = (reponse: 'autoriser' | 'refuser') => void window.arbalete.answerPermission(reponse)
  return (
    <Modal className="permission-modal" role="alertdialog" label={`Permission demandée par ${demande.hote}`} testId="permission-modal" onClose={onClose}>
        <div><strong>{demande.hote}</strong> souhaite {phraseDemande(demande.permissions)}.</div>
        <div className="permission-modal-actions">
          <Button size="sm" autoFocus onClick={() => repondre('refuser')}>Refuser</Button>
          <Button size="sm" variant="primary" onClick={() => repondre('autoriser')}>Autoriser</Button>
        </div>
      </Modal>
  )
}
