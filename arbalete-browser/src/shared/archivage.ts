// Onglets du jour et archivage (ARB-64, EP-12) : un onglet non épinglé laissé de côté plus longtemps que le délai choisi
// est fermé et rangé dans l'archive, d'où l'utilisateur le rouvre. Partagé par le processus principal et l'aperçu web.

// Délais proposés, en heures (0 : jamais). 12 h est celui d'Arc.
export const DELAIS_ARCHIVAGE = [12, 24, 168, 720, 0] as const
export const DELAI_ARCHIVAGE_DEFAUT = 12
export const ARCHIVE_GARDEE_MAX = 200

export const LIBELLES_DELAI: Record<number, string> = {
  12: '12 heures',
  24: '24 heures',
  168: '7 jours',
  720: '30 jours',
  0: 'Jamais'
}

export const delaiArchivageValide = (valeur: unknown): valeur is number =>
  typeof valeur === 'number' && (DELAIS_ARCHIVAGE as readonly number[]).includes(valeur)

export type ElementArchive = { id: number; url: string; titre: string; date: number }

export type OngletArchivable = {
  id: string
  epingle: boolean
  // Onglet affiché de son espace : jamais archivé, l'espace ne se retrouverait pas sans page.
  affiche: boolean
  // Joue du son : l'utilisateur l'écoute encore.
  sonore: boolean
  // Dernier usage, en millisecondes depuis 1970.
  activite: number
}

// Identifiants des onglets à archiver : ni épinglés, ni affichés, ni sonores, laissés de côté depuis `delaiHeures` ou plus.
export function ongletsAArchiver(
  onglets: readonly OngletArchivable[],
  maintenant: number,
  delaiHeures: number
): string[] {
  if (!delaiArchivageValide(delaiHeures) || delaiHeures === 0) return []
  const limite = delaiHeures * 3_600_000
  return onglets
    .filter((o) => !o.epingle && !o.affiche && !o.sonore && maintenant - o.activite >= limite)
    .map((o) => o.id)
}

// Les épinglés d'abord, chacun des deux groupes gardant son ordre.
export function epinglesDabord<T extends { epingle: boolean }>(onglets: readonly T[]): T[] {
  return [...onglets.filter((o) => o.epingle), ...onglets.filter((o) => !o.epingle)]
}
