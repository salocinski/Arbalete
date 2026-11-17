import { forwardRef, type HTMLAttributes } from 'react'
import { cx } from './cx'

// Surface flottante commune (ARB-126) : rayon, ombre et couleurs viennent des tokens via `.floating-panel` (styles.css).
// Menus, panneaux, infobulles et dialogues s'y raccordent ; la taille et la mise en page restent à la charge de l'appelant.
export const FloatingPanel = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function FloatingPanel(
  { className, ...reste },
  ref
) {
  return <div ref={ref} className={cx('floating-panel', className)} {...reste} />
})
