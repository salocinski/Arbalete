// Permissions de site (ARB-15) : le plein écran est accordé d'office, caméra, micro, notifications et position se
// demandent une fois par site puis le choix est mémorisé. Tout le reste (HID, USB, presse-papiers…) reste refusé.
export const PERMISSIONS_SITE = [
  'plein-ecran',
  'camera',
  'micro',
  'notifications',
  'geolocalisation',
  'presse-papiers'
] as const
export type PermissionSite = (typeof PERMISSIONS_SITE)[number]

export const REPONSES_PERMISSION = ['autoriser', 'refuser'] as const
export type ReponsePermission = (typeof REPONSES_PERMISSION)[number]

// Invite affichée à l'utilisateur : le site (hôte de la page) et ce qu'il demande.
export type DemandePermission = { hote: string; permissions: PermissionSite[] }

export const LIBELLES_PERMISSION: Record<PermissionSite, string> = {
  'plein-ecran': 'passer en plein écran',
  camera: 'utiliser votre caméra',
  micro: 'utiliser votre micro',
  notifications: 'vous envoyer des notifications',
  geolocalisation: 'connaître votre position',
  'presse-papiers': 'lire votre presse-papiers'
}

// Nom court des permissions, pour le panneau de gestion par site (ARB-145).
export const NOMS_PERMISSION: Record<PermissionSite, string> = {
  'plein-ecran': 'Plein écran',
  camera: 'Caméra',
  micro: 'Micro',
  notifications: 'Notifications',
  geolocalisation: 'Position',
  'presse-papiers': 'Presse-papiers'
}

// Choix affiché pour une permission d'un site : `demander` = aucun choix mémorisé (le site redemandera ; le plein écran,
// lui, reste accordé d'office).
export const CHOIX_SITE = ['autoriser', 'refuser', 'demander'] as const
export type ChoixSite = (typeof CHOIX_SITE)[number]

export function choixSiteValide(valeur: unknown): valeur is ChoixSite {
  return CHOIX_SITE.some((choix) => choix === valeur)
}

export function permissionSiteValide(valeur: unknown): valeur is PermissionSite {
  return PERMISSIONS_SITE.some((permission) => permission === valeur)
}

// Un site du panneau : son hôte et les choix mémorisés (absent = `demander`).
export type SitePermissions = {
  hote: string
  choix: Partial<Record<PermissionSite, ReponsePermission>>
}

// Phrase de l'invite : « utiliser votre caméra et utiliser votre micro » devient « utiliser votre caméra et votre micro »
// seulement si l'on factorise ; on garde la liste telle quelle, lisible et sans cas particulier.
export function phraseDemande(permissions: readonly PermissionSite[]): string {
  return permissions.map((permission) => LIBELLES_PERMISSION[permission]).join(' et ')
}

// Permissions d'Electron que la demande recouvre, ou null si elle n'est pas gérée (donc refusée). `media` porte caméra
// et/ou micro : `mediaTypes` pour une demande, `mediaType` pour une vérification ; sans type précis, les deux.
export function permissionsDemandees(
  permission: string,
  details?: { mediaTypes?: readonly string[]; mediaType?: string }
): PermissionSite[] | null {
  if (permission === 'fullscreen') return ['plein-ecran']
  if (permission === 'notifications') return ['notifications']
  if (permission === 'geolocation') return ['geolocalisation']
  if (permission === 'clipboard-read') return ['presse-papiers']
  if (permission !== 'media') return null
  const types = details?.mediaTypes ?? (details?.mediaType ? [details.mediaType] : [])
  const resultat: PermissionSite[] = []
  if (types.includes('video')) resultat.push('camera')
  if (types.includes('audio')) resultat.push('micro')
  return resultat.length ? resultat : ['camera', 'micro']
}

// Une permission refusée une fois bloque la demande ; toutes accordées, elle passe sans invite ; sinon on demande.
// Le plein écran, sans choix enregistré, est accordé (le geste de l'utilisateur est exigé par Chromium).
export function decisionPermissions(
  permissions: readonly PermissionSite[],
  lire: (permission: PermissionSite) => ReponsePermission | undefined
): ReponsePermission | 'demander' {
  const choix = permissions.map(
    (permission) => lire(permission) ?? (permission === 'plein-ecran' ? 'autoriser' : undefined)
  )
  if (choix.includes('refuser')) return 'refuser'
  return choix.every((c) => c === 'autoriser') ? 'autoriser' : 'demander'
}
