import { useEffect, useState } from 'react'
import {
  CHOIX_SITE,
  NOMS_PERMISSION,
  PERMISSIONS_SITE,
  type ChoixSite,
  type PermissionSite,
  type SitePermissions
} from '../../../shared/permissions'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'

// Panneau des permissions par site (ARB-145) : modale de la couche d'overlays. Les sites qui ont un choix mémorisé pour le
// profil de l'espace affiché, avec pour chaque permission Demander (aucun choix : le site redemandera), Autoriser ou
// Bloquer ; « Réinitialiser » efface tous les choix d'un site. Le plein écran, sans choix, est accordé d'office.
const LIBELLES: Record<ChoixSite, string> = { demander: 'Demander', autoriser: 'Autoriser', refuser: 'Bloquer' }

export function PermissionsPanel({ onClose }: { onClose: () => void }) {
  const [sites, setSites] = useState<SitePermissions[] | null>(null)
  const [erreur, setErreur] = useState('')
  const relire = () =>
    window.arbalete.listSitePermissions().then(
      (liste) => setSites(liste),
      () => setSites([])
    )
  useEffect(() => {
    void relire()
  }, [])
  const agir = (action: Promise<void>) => {
    setErreur('')
    action.then(relire, () => setErreur('Le réglage n’a pas pu être enregistré.'))
  }
  return (
    <Modal className="palette history" label="Permissions des sites" onClose={onClose}>
      <div className="palette-liste" data-testid="permissions-panel">
        {sites?.length === 0 && <p className="palette-vide">Aucun site n’a de choix mémorisé</p>}
        {erreur && <p role="alert">{erreur}</p>}
        {sites?.map((site) => (
          <section key={site.hote} aria-label={site.hote} className="permission-site" data-testid="permission-site">
            <div className="permission-site-tete">
              <h3 className="history-day">{site.hote}</h3>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => agir(window.arbalete.resetSitePermissions(site.hote))}
              >
                Réinitialiser
              </Button>
            </div>
            {PERMISSIONS_SITE.map((permission) => (
              <LignePermission
                key={permission}
                permission={permission}
                choix={site.choix[permission] ?? 'demander'}
                onChange={(choix) => agir(window.arbalete.setSitePermission(site.hote, permission, choix))}
              />
            ))}
          </section>
        ))}
      </div>
    </Modal>
  )
}

function LignePermission({
  permission,
  choix,
  onChange
}: {
  permission: PermissionSite
  choix: ChoixSite
  onChange: (choix: ChoixSite) => void
}) {
  return (
    <label className="permission-ligne">
      <span>{NOMS_PERMISSION[permission]}</span>
      <select value={choix} onChange={(event) => onChange(event.target.value as ChoixSite)}>
        {CHOIX_SITE.map((valeur) => (
          <option key={valeur} value={valeur}>
            {valeur === 'demander' && permission === 'plein-ecran' ? 'Par défaut (autorisé)' : LIBELLES[valeur]}
          </option>
        ))}
      </select>
    </label>
  )
}
