// Piège de focus d'une modale (ARB-126) : index suivant dans la boucle des éléments focalisables. `courant` vaut -1
// quand le focus est hors de la liste (sur le panneau lui-même) : Tab va au premier, Maj+Tab au dernier.
export function prochainFocus(courant: number, total: number, arriere: boolean): number {
  if (total <= 0) return -1
  if (courant < 0) return arriere ? total - 1 : 0
  return (courant + (arriere ? -1 : 1) + total) % total
}
