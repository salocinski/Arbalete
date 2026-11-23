import { useRef } from 'react'
import { ECART_PARTAGE, RATIO_MAX, RATIO_MIN } from '../../../shared/vuePartagee'

// Poignée de la vue partagée (ARB-148) : posée dans l'écart de 8 px entre les deux pages, seul endroit de la zone de page
// que les vues natives ne couvrent pas. Le glisser garde la souris (capture) quand elle passe sur une page ; les flèches
// règlent aussi la largeur. Le processus principal borne le ratio reçu.
export function SplitHandle({ ratio }: { ratio: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const image = useRef(0)
  // Un message par image au plus : une souris rapide enverrait sinon un replacement des vues par mouvement.
  const regler = (clientX: number) => {
    const zone = ref.current?.parentElement?.getBoundingClientRect()
    if (!zone || zone.width <= ECART_PARTAGE) return
    const valeur = (clientX - zone.left - ECART_PARTAGE / 2) / (zone.width - ECART_PARTAGE)
    cancelAnimationFrame(image.current)
    image.current = requestAnimationFrame(() => window.arbalete.setSplitRatio(valeur))
  }
  return (
    <div
      ref={ref}
      className="split-handle"
      data-testid="split-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="Largeur des deux pages"
      aria-valuemin={Math.round(RATIO_MIN * 100)}
      aria-valuemax={Math.round(RATIO_MAX * 100)}
      aria-valuenow={Math.round(ratio * 100)}
      tabIndex={0}
      style={{ left: `calc((100% - ${ECART_PARTAGE}px) * ${ratio})` }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        regler(event.clientX)
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) regler(event.clientX)
      }}
      onDoubleClick={() => window.arbalete.setSplitRatio(0.5)}
      onKeyDown={(event) => {
        const pas = event.key === 'ArrowLeft' ? -0.05 : event.key === 'ArrowRight' ? 0.05 : 0
        if (!pas) return
        event.preventDefault()
        window.arbalete.setSplitRatio(ratio + pas)
      }}
    />
  )
}
