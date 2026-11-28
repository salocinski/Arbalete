import type { WebContents } from 'electron'

// Politique des adresses file: (ARB-17, décision 0005) : un fichier du disque local saisi par l'utilisateur s'ouvre ;
// un chemin réseau (UNC) jamais, et une page web ne mène pas à un fichier.

// Adresse normalisée d'un fichier local, ou null. Un hôte (file://serveur/partage) ou quatre barres
// (file:////serveur/partage) désignent un chemin UNC : Windows s'y connecterait en SMB et enverrait un hachage NTLM
// du compte. shortcut: aucun hôte n'est admis ; à revoir (confirmation ou liste d'hôtes de confiance) si des
// partages réseau d'entreprise deviennent un besoin, voir la décision 0005.
export function adresseFichierLocal(url: string): string | null {
  if (!URL.canParse(url)) return null
  const adresse = new URL(url)
  if (adresse.protocol !== 'file:' || adresse.host !== '' || adresse.pathname.startsWith('//')) return null
  return adresse.href
}

// will-navigate d'un onglet : le web va au web ; un fichier local va au web ou à un autre fichier local, jamais
// l'inverse. Chromium bloque déjà http vers file dans le rendu (essai de ARB-17) : ceci double sa garde.
export function navigationAutorisee(depuis: string, vers: string): boolean {
  if (/^https?:\/\//i.test(vers)) return true
  return adresseFichierLocal(vers) !== null && /^file:/i.test(depuis)
}

// will-frame-navigate (sous-cadres) et will-redirect (ARB-139) : seule une cible file: est jugée. Elle n'est admise que
// si c'est un fichier du disque local (jamais UNC) ET si la page de l'onglet est elle-même en file: ; le web, about:,
// data: et blob: n'y mènent jamais. Les autres schémas (iframes data:, mailto: ou schéma d'application) restent à
// Chromium, qui refuse déjà une redirection HTTP vers un schéma non web.
// shortcut: `depuis` est l'adresse de la page de l'onglet, pas celle du cadre ni de l'origine de la navigation : depuis une
// page file:, un iframe (web ou data:) ou une redirection (même du cadre principal) peut donc aller vers un fichier local, déjà accessible à cette page, et Chromium garde sa propre
// garde ; à affiner avec details.initiator si un cas réel apparaît.
export function cadreAutorise(depuis: string, vers: string): boolean {
  if (!/^file:/i.test(vers)) return true
  return adresseFichierLocal(vers) !== null && /^file:/i.test(depuis)
}

// `mainFrame.url` est la page validée, pas l'adresse en attente de `getURL()` (un file: tapé dans la barre ne se fait pas passer pour la source).
// Branche le filtre sur un contenu (onglet ou pop-up) : sous-cadres hors cadre principal (déjà filtré par will-navigate)
// et redirections de tous les cadres.
export function filtrerCadres(contenu: WebContents): void {
  const refuser = (details: { url: string; preventDefault: () => void }, nature: string) => {
    console.warn(`Navigation refusée (${nature}) vers une adresse file:`) // sans le chemin local : un flot d'iframes ne remplit pas les journaux de chemins
    details.preventDefault()
  }
  contenu.on('will-frame-navigate', (details) => {
    if (!details.isMainFrame && !cadreAutorise(contenu.mainFrame.url, details.url)) refuser(details, 'sous-cadre')
  })
  contenu.on('will-redirect', (details) => {
    if (!cadreAutorise(contenu.mainFrame.url, details.url)) refuser(details, 'redirection')
  })
}
