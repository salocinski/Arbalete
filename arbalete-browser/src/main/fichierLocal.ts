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
  return adresseFichierLocal(vers) !== null && !/^https?:\/\//i.test(depuis)
}
