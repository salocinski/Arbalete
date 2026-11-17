import type { ReactNode } from 'react'
import { Button, type ButtonProps } from './Button'
import { INFOBULLE_NATIVE, useTooltip } from './Tooltip'

// Bouton réduit à une icône : `title` est obligatoire, il sert d'infobulle et de nom accessible (DESIGN.md,
// Iconography : une icône seule non explicite a une infobulle).
// L'infobulle est la bulle native de `useTooltip` (ARB-126) ; les vues qui n'en ont pas (recherche, avis) gardent `title`.
type IconButtonProps = Omit<ButtonProps, 'icon' | 'children' | 'title'> & { title: string; children: ReactNode }

export function IconButton({ title, children, className, variant = 'ghost', ...reste }: IconButtonProps) {
  const bulle = useTooltip(title)
  return (
    <Button
      variant={variant}
      title={INFOBULLE_NATIVE ? title : undefined}
      aria-label={title}
      className={`ui-button--icon${className ? ` ${className}` : ''}`}
      {...(INFOBULLE_NATIVE ? {} : bulle)}
      {...reste}
    >
      {children}
    </Button>
  )
}
