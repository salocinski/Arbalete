import { useState } from 'react'
import { Eraser, Pencil, Plus, Trash2 } from 'lucide-react'
import { LONGUEUR_MAX_NOM_PROFIL, PROFIL_PRINCIPAL, nomProfilValide, type Profil } from '../../../shared/profils'
import type { Espace } from '../../../shared/espaces'
import { Button } from './ui/Button'
import { IconButton } from './ui/IconButton'
import { Input } from './ui/Input'
import { Modal } from './ui/Modal'

// Ce que la modale attend d'une ligne : un nom (création ou renommage) ou la confirmation d'une action qui détruit des comptes.
type Action =
  | { kind: 'creer' }
  | { kind: 'renommer'; id: number }
  | { kind: 'supprimer'; id: number }
  | { kind: 'effacer'; id: number }

// Modale des profils (ARB-143), dans la couche d'overlays, ouverte depuis le menu d'un espace. Un clic sur un profil le donne
// à l'espace (ses onglets rechargent leur page dans la nouvelle session) ; on y crée, renomme, supprime un profil et efface
// ses données (cookies, cache, stockage). Le processus principal refuse de supprimer le principal ou un profil qui a des espaces
// et l'erreur s'affiche ici.
export function ProfilesModal({
  espace,
  profils,
  espaces,
  onClose
}: {
  espace: Espace
  profils: Profil[]
  espaces: Espace[]
  onClose: () => void
}) {
  const [action, setAction] = useState<Action | null>(null)
  const [nom, setNom] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  const terminer = () => {
    setAction(null)
    setNom('')
  }
  const lancer = (promesse: Promise<unknown>) => {
    setErreur(null)
    promesse.then(terminer, (e: unknown) => setErreur(e instanceof Error ? e.message : 'Action impossible'))
  }
  const valider = () => {
    if (!nomProfilValide(nom) || !action) return
    if (action.kind === 'creer') lancer(window.arbalete.createProfile(nom))
    if (action.kind === 'renommer') lancer(window.arbalete.renameProfile(action.id, nom))
  }
  const nombreEspaces = (id: number) => espaces.filter((e) => e.profil === id).length

  return (
    <Modal className="profiles-modal" label={`Profil de l’espace ${espace.nom}`} onClose={onClose}>
      <div className="color-modal-title">Profil de l’espace « {espace.nom} »</div>
      <ul className="profiles-list" role="radiogroup" aria-label="Profils">
        {profils.map((profil) => {
          const choisi = profil.id === espace.profil
          if (action?.kind === 'supprimer' || action?.kind === 'effacer') {
            if (action.id !== profil.id) return null
            const suppression = action.kind === 'supprimer'
            return (
              <li key={profil.id} className="profiles-row profiles-row--confirm">
                <span className="workspace-confirm-text">
                  {suppression
                    ? `Supprimer « ${profil.nom} » et ses comptes ?`
                    : `Effacer cookies et cache de « ${profil.nom} » ?`}
                </span>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    lancer(
                      suppression
                        ? window.arbalete.deleteProfile(profil.id)
                        : window.arbalete.clearProfileData(profil.id)
                    )
                  }
                >
                  {suppression ? 'Supprimer' : 'Effacer'}
                </Button>
                <Button size="sm" onClick={terminer}>
                  Annuler
                </Button>
              </li>
            )
          }
          if (action?.kind === 'renommer' && action.id === profil.id) {
            return (
              <li key={profil.id} className="profiles-row">
                <Input
                  autoFocus
                  value={nom}
                  maxLength={LONGUEUR_MAX_NOM_PROFIL}
                  aria-label="Nom du profil"
                  onChange={(event) => setNom(event.target.value)}
                  onKeyDown={(event) => {
                    event.stopPropagation()
                    if (event.key === 'Enter') valider()
                    if (event.key === 'Escape') terminer()
                  }}
                />
              </li>
            )
          }
          return (
            <li key={profil.id} className="profiles-row">
              <button
                role="radio"
                aria-checked={choisi}
                className="workspace-choice"
                data-profil={profil.id}
                autoFocus={choisi}
                onClick={() => !choisi && lancer(window.arbalete.setWorkspaceProfile(espace.id, profil.id))}
              >
                <span className="workspace-name">{profil.nom}</span>
                <span className="profiles-count">{nombreEspaces(profil.id)} espace(s)</span>
              </button>
              <IconButton
                title={`Renommer ${profil.nom}`}
                onClick={() => {
                  setNom(profil.nom)
                  setAction({ kind: 'renommer', id: profil.id })
                }}
              >
                <Pencil size={14} />
              </IconButton>
              <IconButton
                title={`Effacer les données de ${profil.nom}`}
                onClick={() => setAction({ kind: 'effacer', id: profil.id })}
              >
                <Eraser size={14} />
              </IconButton>
              {profil.id !== PROFIL_PRINCIPAL && (
                <IconButton
                  title={`Supprimer ${profil.nom}`}
                  onClick={() => setAction({ kind: 'supprimer', id: profil.id })}
                >
                  <Trash2 size={14} />
                </IconButton>
              )}
            </li>
          )
        })}
      </ul>
      {action?.kind === 'creer' ? (
        <Input
          autoFocus
          value={nom}
          maxLength={LONGUEUR_MAX_NOM_PROFIL}
          aria-label="Nom du nouveau profil"
          placeholder="Nom du profil"
          onChange={(event) => setNom(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Enter') valider()
            if (event.key === 'Escape') terminer()
          }}
        />
      ) : (
        !action && (
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setAction({ kind: 'creer' })}>
            Nouveau profil
          </Button>
        )
      )}
      {erreur && (
        <div role="alert" className="profiles-error">
          {erreur}
        </div>
      )}
    </Modal>
  )
}
