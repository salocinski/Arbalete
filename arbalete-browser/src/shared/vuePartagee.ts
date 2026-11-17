// Vue partagée (ARB-72, EP-13) : deux onglets de l'espace affiché côte à côte, l'onglet actif étant celui des deux qui a le clavier.
export interface Partage {
  gauche: string
  droite: string
}
interface Zone {
  x: number
  y: number
  width: number
  height: number
}

// Espace entre les deux pages, jumeau de la marge de la page (8 px).
export const ECART_PARTAGE = 8

export const dansPartage = (partage: Partage | null, id: string | null): boolean =>
  !!partage && !!id && (partage.gauche === id || partage.droite === id)

// Les deux moitiés de la zone de page ; la droite prend le pixel restant d'une largeur impaire.
export function scinder(zone: Zone): { gauche: Zone; droite: Zone } {
  const largeur = Math.max(0, Math.floor((zone.width - ECART_PARTAGE) / 2))
  return {
    gauche: { ...zone, width: largeur },
    droite: { ...zone, x: zone.x + largeur + ECART_PARTAGE, width: Math.max(0, zone.width - largeur - ECART_PARTAGE) }
  }
}

// Entrée « Vue partagée » du menu d'un onglet : sur un onglet déjà partagé, elle quitte la vue ; sinon elle place l'onglet
// visé à droite de l'onglet actif (refusée sur l'onglet actif lui-même, qui n'a pas de voisin).
export function basculerPartage(courant: Partage | null, actif: string | null, cible: string): Partage | null {
  if (dansPartage(courant, cible)) return null
  if (!actif || actif === cible) return courant
  return { gauche: actif, droite: cible }
}
