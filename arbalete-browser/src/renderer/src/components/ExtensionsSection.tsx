import { useState } from 'react'
import { libellePermission } from '../../../shared/extensions'
import { useBrowserState } from '../state'
import { Button } from './ui/Button'

// Section « Extensions » de la page Paramètres (ARB-144, décision 0004). Éteinte par défaut : le réglage ne s'applique qu'au
// redémarrage. Une extension s'ajoute depuis un dossier décompressé (Manifest V3), inactive ; ses permissions sont listées
// avant de l'activer. shortcut: pas de panneau propre ni de popups d'extension (ARB-144 suite) ; à ajouter avec la barre d'actions.
export function ExtensionsSection() {
  const { extensions, extensionsActif } = useBrowserState()
  const [erreur, setErreur] = useState<string | null>(null)
  const agir = (action: Promise<unknown>) => {
    setErreur(null)
    action.catch((e: unknown) =>
      setErreur(
        e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']*': (Error: )?/, '') : 'Échec'
      )
    )
  }

  return (
    <>
      <label className="settings-row settings-row--case">
        <input
          type="checkbox"
          checked={extensionsActif}
          onChange={(event) => agir(window.arbalete.setExtensionsEnabled(event.target.checked))}
        />
        Activer les extensions Chrome (fonction expérimentale)
      </label>
      <p className="settings-help">
        Le changement s’applique au prochain démarrage. Une extension lit les pages que vous visitez : n’ajoutez que
        celles que vous connaissez. Chaque profil a ses propres extensions.
      </p>
      {extensions.map((e) => (
        <div key={e.id} className="settings-block">
          <label className="settings-row settings-row--case">
            <input
              type="checkbox"
              checked={e.actif}
              onChange={(event) => agir(window.arbalete.setExtensionEnabled(e.id, event.target.checked))}
            />
            {e.nom} {e.version}
            {e.erreur ? ' (erreur de chargement)' : ''}
          </label>
          {e.permissions.length > 0 && (
            <ul className="settings-help">
              {e.permissions.map((p) => (
                <li key={p}>{libellePermission(p)}</li>
              ))}
            </ul>
          )}
          <Button variant="destructive" size="sm" onClick={() => agir(window.arbalete.removeExtension(e.id))}>
            Retirer
          </Button>
        </div>
      ))}
      <div className="settings-actions">
        <Button size="sm" onClick={() => agir(window.arbalete.addExtensionFolder())}>
          Ajouter une extension (dossier)…
        </Button>
      </div>
      {erreur && (
        <p className="settings-help" role="alert">
          {erreur}
        </p>
      )}
    </>
  )
}
