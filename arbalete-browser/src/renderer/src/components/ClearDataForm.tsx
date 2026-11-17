import { useState } from 'react'
import type { PeriodeEffacement, TypeEffacement } from '../../../shared/historique'
import { Button } from './ui/Button'

const PERIODES: Array<[PeriodeEffacement, string]> = [
  ['heure', 'La dernière heure'],
  ['jour', 'Les dernières 24 heures'],
  ['semaine', 'Les 7 derniers jours'],
  ['tout', 'Depuis toujours']
]
const TYPES: Array<[TypeEffacement, string]> = [
  ['historique', 'Historique de navigation'],
  ['cookies', 'Cookies (en entier)'],
  ['cache', 'Cache (en entier)']
]

// Effacement des données de navigation (ARB-54), partagé par le panneau Historique et la page Paramètres (ARB-57). Un
// premier clic demande confirmation, le second efface ; toute modification du choix annule la demande. `onCleared` est
// appelé aussi en cas d'échec : l'historique a pu être effacé avant l'erreur (cookies, cache).
export function ClearDataForm({ onCleared }: { onCleared?: () => void }) {
  const [periode, setPeriode] = useState<PeriodeEffacement>('heure')
  const [types, setTypes] = useState<TypeEffacement[]>(['historique'])
  const [confirme, setConfirme] = useState(false)
  const effacer = () => {
    if (!confirme) {
      setConfirme(true)
      return
    }
    setConfirme(false)
    const fini = () => onCleared?.()
    void window.arbalete.clearBrowsingData(periode, types).then(fini, fini)
  }
  return (
    <fieldset className="history-clear" onChange={() => setConfirme(false)}>
      <legend>Effacer les données de navigation</legend>
      <select
        aria-label="Période"
        value={periode}
        onChange={(event) => setPeriode(event.target.value as PeriodeEffacement)}
      >
        {PERIODES.map(([valeur, libelle]) => (
          <option key={valeur} value={valeur}>
            {libelle}
          </option>
        ))}
      </select>
      {TYPES.map(([valeur, libelle]) => (
        <label key={valeur}>
          <input
            type="checkbox"
            checked={types.includes(valeur)}
            onChange={(event) =>
              setTypes((actuels) =>
                event.target.checked ? [...actuels, valeur] : actuels.filter((type) => type !== valeur)
              )
            }
          />
          {libelle}
        </label>
      ))}
      <Button variant="destructive" size="sm" disabled={!types.length} onClick={effacer}>
        {confirme ? 'Confirmer l’effacement' : 'Effacer'}
      </Button>
    </fieldset>
  )
}
