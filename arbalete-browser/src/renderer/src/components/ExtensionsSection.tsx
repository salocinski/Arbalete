import { useState } from 'react'
import { libellePermission } from '../../../shared/extensions'
import { useBrowserState } from '../state'
import { Button } from './ui/Button'
import { Input } from './ui/Input'

// Section « Extensions » de la page Paramètres (ARB-144, décision 0004). Éteinte par défaut : le réglage ne s'applique qu'au
// redémarrage. Une extension s'ajoute depuis un dossier décompressé (Manifest V3) ou le Chrome Web Store (mise à jour à la demande), inactive ; ses permissions sont listées
// avant de l'activer. shortcut: pas de panneau propre ni de popups d'extension (ARB-144 suite) ; à ajouter avec la barre d'actions.
export function ExtensionsSection() {
  const { extensions, extensionsActif } = useBrowserState()
  const [erreur, setErreur] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [entree, setEntree] = useState('')
  const [occupe, setOccupe] = useState(false) // un téléchargement du Web Store est en cours
  const agir = (action: Promise<unknown>, apres?: (resultat: unknown) => void) => {
    setErreur(null)
    setInfo(null)
    action
      .then(apres)
      .catch((e: unknown) =>
        setErreur(
          e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']*': (Error: )?/, '') : 'Échec'
        )
      )
  }

  // Installation et mise à jour du Web Store : un seul téléchargement à la fois depuis l'interface.
  const telecharger = (action: Promise<unknown>, apres?: (resultat: unknown) => void) => {
    setOccupe(true)
    agir(
      action.finally(() => setOccupe(false)),
      apres
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
          <p className="settings-help">{e.storeId ? 'Source : Chrome Web Store' : 'Source : dossier local'}</p>
          {e.permissions.length > 0 && (
            <ul className="settings-help">
              {e.permissions.map((p) => (
                <li key={p}>{libellePermission(p)}</li>
              ))}
            </ul>
          )}
          {e.storeId && (
            <Button
              size="sm"
              disabled={occupe}
              aria-label={`Rechercher une mise à jour de ${e.nom}`}
              onClick={() =>
                telecharger(window.arbalete.updateExtension(e.id), (r) =>
                  setInfo(r === 'mise-a-jour' ? `${e.nom} a été mise à jour.` : `${e.nom} est déjà à jour.`)
                )
              }
            >
              Rechercher une mise à jour
            </Button>
          )}{' '}
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
      <Input
        aria-label="Identifiant ou lien du Chrome Web Store"
        placeholder="Identifiant ou lien de la fiche du Chrome Web Store"
        value={entree}
        onChange={(event) => setEntree(event.target.value)}
      />
      <div className="settings-actions">
        <Button
          size="sm"
          disabled={occupe || entree.trim() === ''}
          onClick={() =>
            telecharger(window.arbalete.addExtensionStore(entree), () => {
              setEntree('')
              setInfo('Extension ajoutée, inactive : relisez ses permissions avant de l’activer.')
            })
          }
        >
          {occupe ? 'Téléchargement…' : 'Installer depuis le Chrome Web Store'}
        </Button>
      </div>
      {info && (
        <p className="settings-help" role="status">
          {info}
        </p>
      )}
      {erreur && (
        <p className="settings-help" role="alert">
          {erreur}
        </p>
      )}
    </>
  )
}
