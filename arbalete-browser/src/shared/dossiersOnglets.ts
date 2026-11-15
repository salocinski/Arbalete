// Dossiers d'onglets de la barre latérale (ARB-69, EP-13) : un dossier appartient à un espace, regroupe des onglets non
// épinglés et peut être replié. Les dossiers passent à l'interface dans l'ordre de leur création.
export type DossierOnglet = { id: number; nom: string; replie: boolean }

export const LONGUEUR_MAX_NOM_DOSSIER_ONGLET = 60

// Nom nettoyé, ou null s'il est vide ou trop long.
export function nomDossierOngletValide(nom: unknown): string | null {
  const propre = typeof nom === 'string' ? nom.trim() : ''
  return propre.length > 0 && propre.length <= LONGUEUR_MAX_NOM_DOSSIER_ONGLET ? propre : null
}

// Un onglet n'entre dans un dossier que s'il n'est pas épinglé et que le dossier existe dans son espace.
export function dossierAccepte(dossiers: { id: number; espace: number }[], dossier: number | undefined, espaceOnglet: number | null, epingle: boolean): boolean {
  return dossier !== undefined && !epingle && dossiers.some((item) => item.id === dossier && item.espace === espaceOnglet)
}

export type SectionOnglets<T> = { dossier: DossierOnglet | null; onglets: T[] }

// Sections de la liste « Aujourd’hui » : chaque dossier avec ses onglets (dans l'ordre reçu), puis les onglets sans dossier.
// Un dossier replié ne montre que l'onglet actif. Un onglet dont le dossier est inconnu est rangé à la racine.
export function sectionsParDossier<T extends { id: string; folder?: number }>(onglets: T[], dossiers: DossierOnglet[], actifId: string | null): SectionOnglets<T>[] {
  const connus = new Set(dossiers.map((dossier) => dossier.id))
  const sections: SectionOnglets<T>[] = dossiers.map((dossier) => ({
    dossier,
    onglets: onglets.filter((onglet) => onglet.folder === dossier.id && (!dossier.replie || onglet.id === actifId))
  }))
  sections.push({ dossier: null, onglets: onglets.filter((onglet) => onglet.folder === undefined || !connus.has(onglet.folder)) })
  return sections
}
