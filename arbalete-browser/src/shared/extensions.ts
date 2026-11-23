// Extensions Chrome (ARB-144, EP-04, décision 0004) : types partagés, validation du manifest et libellés des permissions.
// Rien n'est chargé tant que le réglage « Extensions » est faux (`pref.extensions.actif`, ARB-144).

export type Extension = {
  id: number
  profil: number
  nom: string
  version: string
  permissions: string[]
  actif: boolean
  /** Présent (vrai) quand l'extension est active mais n'a pas pu être chargée (ARB-144). */
  erreur?: true
}

export const LONGUEUR_MAX_NOM_EXTENSION = 75 // limite de Chrome
export const LONGUEUR_MAX_PERMISSION = 100
export const PERMISSIONS_MAX = 200
export const TAILLE_MAX_MANIFEST = 1024 * 1024

export type ManifestValide = { nom: string; version: string; permissions: string[] }

// Manifest MV3 lu depuis le disque (donc hostile) : nom, version et permissions bornés, ou un message d'erreur.
// shortcut: un nom localisé (« __MSG_… __ ») est gardé tel quel, sans lire _locales ; à résoudre si l'affichage gêne.
export function validerManifest(brut: unknown): ManifestValide | { erreur: string } {
  if (typeof brut !== 'object' || brut === null || Array.isArray(brut)) return { erreur: 'Manifest invalide' }
  const m = brut as Record<string, unknown>
  if (m.manifest_version !== 3) return { erreur: 'Seules les extensions Manifest V3 sont prises en charge' }
  const nom = typeof m.name === 'string' ? m.name.trim() : ''
  if (nom.length === 0 || nom.length > LONGUEUR_MAX_NOM_EXTENSION) return { erreur: 'Nom d’extension invalide' }
  const version = typeof m.version === 'string' ? m.version.trim() : ''
  if (!/^\d{1,9}(\.\d{1,9}){0,3}$/.test(version)) return { erreur: 'Version d’extension invalide' }
  const permissions: string[] = []
  for (const cle of ['permissions', 'host_permissions']) {
    const liste = m[cle]
    if (liste === undefined) continue
    if (!Array.isArray(liste)) return { erreur: 'Permissions invalides' }
    for (const p of liste) {
      // Une entrée invalide est refusée : l'ignorer cacherait à l'utilisateur une permission que l'extension garde.
      if (typeof p !== 'string' || p.length === 0 || p.length > LONGUEUR_MAX_PERMISSION)
        return { erreur: 'Permission invalide' }
      if (!permissions.includes(p)) permissions.push(p)
    }
  }
  // Les scripts de contenu lisent aussi les pages : leurs adresses comptent parmi les accès à montrer.
  if (Array.isArray(m.content_scripts)) {
    for (const script of m.content_scripts) {
      const matches = (script as { matches?: unknown } | null)?.matches
      if (!Array.isArray(matches)) continue
      for (const p of matches) {
        if (typeof p !== 'string' || p.length === 0 || p.length > LONGUEUR_MAX_PERMISSION)
          return { erreur: 'Permission invalide' }
        if (!permissions.includes(p)) permissions.push(p)
      }
    }
  }
  if (permissions.length > PERMISSIONS_MAX) return { erreur: 'Trop de permissions' }
  return { nom, version, permissions }
}

const LIBELLES: Readonly<Record<string, string>> = {
  activeTab: 'Lire la page active quand vous l’utilisez',
  alarms: 'Planifier des tâches en arrière-plan',
  bookmarks: 'Lire et modifier vos favoris',
  clipboardRead: 'Lire le presse-papiers',
  clipboardWrite: 'Écrire dans le presse-papiers',
  contextMenus: 'Ajouter des entrées aux menus contextuels',
  cookies: 'Lire et modifier vos cookies',
  declarativeNetRequest: 'Bloquer ou modifier des requêtes réseau',
  downloads: 'Gérer vos téléchargements',
  history: 'Lire et modifier votre historique',
  nativeMessaging: 'Communiquer avec des applications de votre ordinateur',
  notifications: 'Afficher des notifications',
  scripting: 'Injecter du code dans les pages',
  storage: 'Enregistrer ses propres données',
  tabs: 'Voir vos onglets (adresses et titres)',
  webNavigation: 'Suivre vos navigations',
  webRequest: 'Observer les requêtes réseau'
}

// Une permission d'hôte (« https://*.exemple.fr/* », « <all_urls> ») vaut un accès aux données des sites.
export function libellePermission(permission: string): string {
  const connu = Object.hasOwn(LIBELLES, permission) ? LIBELLES[permission] : undefined
  if (connu) return connu
  if (permission === '<all_urls>' || /^(\*|https?|ftp|file):\/\//.test(permission)) {
    return `Lire et modifier vos données sur ${permission === '<all_urls>' ? 'tous les sites' : permission}`
  }
  return `Autre permission : ${permission}`
}

// Nom du sous-dossier de la copie d'une extension (généré par le processus principal, jamais saisi) : lettres, chiffres, tiret.
export function dossierExtensionValide(dossier: unknown): dossier is string {
  return typeof dossier === 'string' && /^[a-z0-9-]{1,64}$/.test(dossier)
}
