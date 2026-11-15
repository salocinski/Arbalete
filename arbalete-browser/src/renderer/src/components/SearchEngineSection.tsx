import { useEffect, useState } from 'react'
import { MOTEURS, MOTEUR_DEFAUT, modeleValide, type ChoixMoteur, type MoteurId } from '../../../shared/moteurs'
import { Button } from './ui/Button'
import { Input } from './ui/Input'

const OPTIONS: { id: MoteurId; nom: string }[] = [...MOTEURS.map(({ id, nom }) => ({ id, nom })), { id: 'perso', nom: 'Personnalisé' }]

// Section « Moteur de recherche » de la page Paramètres (ARB-58, ARB-57). Le choix courant est lu au montage ;
// « Personnalisé » demande une adresse https contenant %s. Enregistrer applique le choix sans fermer la modale.
export function SearchEngineSection() {
  const [choix, setChoix] = useState<ChoixMoteur>(MOTEUR_DEFAUT)
  const [enregistre, setEnregistre] = useState(true)
  useEffect(() => {
    void window.arbalete.getSearchEngine().then(setChoix).catch(() => {})
  }, [])

  const modifier = (suivant: ChoixMoteur) => { setChoix(suivant); setEnregistre(false) }
  const perso = choix.id === 'perso'
  const invalide = perso && !modeleValide(choix.modele)
  const enregistrer = () => {
    void window.arbalete.setSearchEngine(choix).then(() => setEnregistre(true), () => {})
  }

  return (
    <>
      <div className="engine-list" role="radiogroup" aria-label="Moteurs">
        {OPTIONS.map(({ id, nom }) => (
          <button key={id} role="radio" className="engine-option" aria-checked={id === choix.id}
            onClick={() => modifier({ id, modele: id === 'perso' ? choix.modele : '' })}>
            {nom}
          </button>
        ))}
      </div>
      {perso && (
        <Input aria-label="Adresse de recherche" placeholder="https://exemple.org/?q=%s" value={choix.modele} autoFocus
          error={invalide && choix.modele ? 'Une adresse https avec un seul %s, remplacé par le texte tapé.' : undefined}
          onChange={(event) => modifier({ id: 'perso', modele: event.target.value })}
          onKeyDown={(event) => { if (event.key === 'Enter' && !invalide) enregistrer() }} />
      )}
      <Button variant="primary" size="sm" disabled={invalide || enregistre} onClick={enregistrer}>{enregistre ? 'Enregistré' : 'Enregistrer'}</Button>
    </>
  )
}
