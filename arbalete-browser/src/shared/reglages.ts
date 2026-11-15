// Réglages de la page Paramètres (ARB-57, EP-11) qui ne sont ni le thème, ni le moteur, ni la barre latérale : page
// d'accueil, réduction des animations, dossier de téléchargement. Partagé par le processus principal et l'aperçu web.
export const ACCUEIL_DEFAUT = 'https://www.google.com'
export const ACCUEIL_LONGUEUR_MAX = 2048
export const CHEMIN_LONGUEUR_MAX = 260 // MAX_PATH de Windows

// `dossierTelechargements` : null = dossier Téléchargements de Windows ; sinon le chemin choisi par l'utilisateur.
export interface Reglages {
  accueil: string
  animationsReduites: boolean
  dossierTelechargements: string | null
}

export const REGLAGES_DEFAUT: Reglages = { accueil: ACCUEIL_DEFAUT, animationsReduites: false, dossierTelechargements: null }

export type ActionDossier = 'choisir' | 'defaut'

// Adresse saisie → adresse http(s) normalisée, ou undefined si elle n'en est pas une : un domaine nu reçoit https://,
// et un nom d'utilisateur ou un mot de passe dans l'adresse est refusé (il resterait en clair dans la base).
export function accueilValide(texte: unknown): string | undefined {
  if (typeof texte !== 'string') return undefined
  const saisie = texte.trim()
  if (!saisie || saisie.length > ACCUEIL_LONGUEUR_MAX || /\s/.test(saisie)) return undefined
  const web = /^https?:\/\//i.test(saisie)
  if (!web && saisie.includes('://')) return undefined // file://, ftp://… : jamais complété en https
  const adresse = web ? saisie : `https://${saisie}`
  if (!URL.canParse(adresse)) return undefined
  const url = new URL(adresse)
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname || url.username || url.password) return undefined
  return url.href
}
