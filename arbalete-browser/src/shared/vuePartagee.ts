// Vue partagée (ARB-72, EP-13) : deux onglets de l'espace affiché côte à côte, l'onglet actif étant celui des deux qui a le clavier.
export interface Partage {
  gauche: string
  droite: string
  // Part de la page de gauche (ARB-148) ; absente = moitié.
  ratio?: number
}
interface Zone {
  x: number
  y: number
  width: number
  height: number
}

// Espace entre les deux pages, jumeau de la marge de la page (8 px).
export const ECART_PARTAGE = 8

// Bornes de la poignée : aucune page ne devient plus étroite que 20 % de la zone.
export const RATIO_MIN = 0.2
export const RATIO_MAX = 0.8

// Ratio reçu d'une interface : non fini, il redonne la moitié ; sinon borné.
export const ratioBorne = (ratio: unknown): number =>
  typeof ratio === 'number' && Number.isFinite(ratio) ? Math.min(RATIO_MAX, Math.max(RATIO_MIN, ratio)) : 0.5

export const dansPartage = (partage: Partage | null, id: string | null): boolean =>
  !!partage && !!id && (partage.gauche === id || partage.droite === id)

// Les deux moitiés de la zone de page ; la droite prend le pixel restant d'une largeur impaire.
export function scinder(zone: Zone, ratio = 0.5): { gauche: Zone; droite: Zone } {
  const largeur = Math.max(0, Math.floor((zone.width - ECART_PARTAGE) * ratioBorne(ratio)))
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

// Restauration (ARB-148) : la vue est écrite sous `pref.partage` avec les indices des deux onglets dans la liste des
// onglets web de la session, que la restauration rouvre dans le même ordre. Texte vide = pas de vue partagée.
export function ecrirePartage(partage: Partage | null, indice: (id: string) => number): string {
  if (!partage) return ''
  const g = indice(partage.gauche)
  const d = indice(partage.droite)
  return g < 0 || d < 0 ? '' : JSON.stringify({ g, d, r: ratioBorne(partage.ratio) })
}

// Lecture défensive (base éditable à la main) : deux indices entiers distincts dans la liste, sinon aucune vue.
export function lirePartage(texte: string | undefined, ids: readonly string[]): Partage | null {
  if (!texte) return null
  try {
    const { g, d, r } = JSON.parse(texte) as { g?: unknown; d?: unknown; r?: unknown }
    if (!Number.isInteger(g) || !Number.isInteger(d) || g === d) return null
    const gauche = ids[g as number]
    const droite = ids[d as number]
    return gauche && droite ? { gauche, droite, ratio: ratioBorne(r) } : null
  } catch {
    return null
  }
}
