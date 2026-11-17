import { useCallback, useEffect, useRef } from 'react'

// Infobulle (ARB-126) : la bulle est une vue native du processus principal (au-dessus de la page, règle 4), ce hook ne fait
// que dire quand et où l'ouvrir. Elle s'ouvre après un court survol, se ferme à la sortie, au clic ou au démontage.
const DELAI_SURVOL_MS = 400
// Vues sans bulle possible (le processus principal refuse leur émetteur) : elles gardent l'infobulle native `title`.
export const INFOBULLE_NATIVE = ['recherche', 'popup'].includes(
  new URLSearchParams(window.location.search).get('vue') ?? ''
)

export function useTooltip(texte: string) {
  const minuteur = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const affichee = useRef(false)

  const fermer = useCallback(() => {
    clearTimeout(minuteur.current)
    if (!affichee.current) return
    affichee.current = false
    void window.arbalete.hideTooltip().catch(() => {})
  }, [])

  const ouvrir = useCallback(
    (element: HTMLElement) => {
      clearTimeout(minuteur.current)
      minuteur.current = setTimeout(() => {
        const { x, y, width, height } = element.getBoundingClientRect()
        affichee.current = true
        void window.arbalete.showTooltip(texte, { x, y, width, height }).catch(() => {
          affichee.current = false
        })
      }, DELAI_SURVOL_MS)
    },
    [texte]
  )

  useEffect(() => fermer, [fermer])

  return {
    onMouseEnter: (event: React.MouseEvent<HTMLElement>) => ouvrir(event.currentTarget),
    onFocus: (event: React.FocusEvent<HTMLElement>) => {
      if (event.currentTarget.matches(':focus-visible')) ouvrir(event.currentTarget)
    },
    onMouseLeave: fermer,
    onBlur: fermer,
    onMouseDown: fermer
  }
}
