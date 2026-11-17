// Mise en veille des onglets (ARB-78, EP-14) : la page d'un onglet laissé de côté est fermée pour libérer sa mémoire ; il reste
// dans la liste et recharge sa page quand on l'affiche (comme un onglet restauré, ARB-45). Partagé par le processus principal
// et l'aperçu web.

// Délais proposés, en minutes (0 : jamais).
export const DELAIS_VEILLE = [15, 30, 60, 240, 0] as const
export const DELAI_VEILLE_DEFAUT = 30

export const LIBELLES_VEILLE: Record<number, string> = {
  15: '15 minutes',
  30: '30 minutes',
  60: '1 heure',
  240: '4 heures',
  0: 'Jamais'
}

export const delaiVeilleValide = (valeur: unknown): valeur is number =>
  typeof valeur === 'number' && (DELAIS_VEILLE as readonly number[]).includes(valeur)

export type OngletEndormissable = {
  id: string
  // Onglet affiché dans la fenêtre : jamais endormi.
  affiche: boolean
  // Joue du son : l'utilisateur l'écoute encore.
  sonore: boolean
  // Page déjà fermée (ou jamais chargée) : rien à libérer.
  enVeille: boolean
  // Dernier usage, en millisecondes depuis 1970.
  activite: number
}

// Identifiants des onglets à endormir : ni affichés, ni sonores, ni déjà en veille, laissés de côté depuis `delaiMinutes` ou plus.
export function ongletsAEndormir(
  onglets: readonly OngletEndormissable[],
  maintenant: number,
  delaiMinutes: number
): string[] {
  if (!delaiVeilleValide(delaiMinutes) || delaiMinutes === 0) return []
  const limite = delaiMinutes * 60_000
  return onglets
    .filter((o) => !o.affiche && !o.sonore && !o.enVeille && maintenant - o.activite >= limite)
    .map((o) => o.id)
}

export type MemoireOnglets = { mo: number; enVeille: number }

// Mémoire des processus des onglets, en Mo : un processus partagé par plusieurs onglets n'est compté qu'une fois.
// `metriques` vient d'`app.getAppMetrics()` (working set en Ko).
export function memoireDesOnglets(pids: readonly number[], metriques: readonly { pid: number; ko: number }[]): number {
  const voulus = new Set(pids)
  return Math.round(metriques.filter((m) => voulus.has(m.pid)).reduce((somme, m) => somme + m.ko, 0) / 1024)
}
