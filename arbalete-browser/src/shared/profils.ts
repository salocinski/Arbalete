// Profils de navigation (ARB-143, décision 0007) : un profil est un contexte Chromium nommé (cookies, cache, stockage,
// permissions, zoom) auquel des espaces sont rattachés. Le profil actif est celui de l'espace affiché.
export const PROFIL_PRINCIPAL = 1
export const LONGUEUR_MAX_NOM_PROFIL = 40

export type Profil = {
  id: number
  nom: string
}

// Nom nettoyé (espaces de bord retirés), ou undefined s'il est vide ou trop long.
export function nomProfilValide(nom: unknown): string | undefined {
  const propre = typeof nom === 'string' ? nom.trim() : ''
  return propre.length > 0 && propre.length <= LONGUEUR_MAX_NOM_PROFIL ? propre : undefined
}

// Partition Electron d'un profil créé après la migration 11 : persistante, une par id. Les profils issus d'un espace isolé
// (ARB-65) gardent la partition `persist:espace-<id>` de cet espace, lue dans la colonne `profil.partition`.
export function nomPartitionProfil(id: number): string {
  return `persist:profil-${id}`
}

// Hôte tel qu'il s'écrit dans les clés de réglages par site (permissions, zoom, pop-ups). Le profil principal garde les clés
// d'avant les profils ; les autres préfixent `<id>@`, caractère qu'un nom d'hôte ne contient pas (pas de collision avec le
// sous-domaine d'un autre site).
export function hotePourProfil(hote: string, profil: number): string {
  return profil === PROFIL_PRINCIPAL ? hote : `${profil}@${hote}`
}
