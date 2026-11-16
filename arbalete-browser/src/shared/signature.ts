// Signature de l'installeur (ARB-76) : SignPath signe l'installeur après electron-builder, qui avait déjà écrit dans
// `latest.yml` le sha512 et la taille de l'installeur non signé. Sans cette remise à jour, electron-updater rejette
// le téléchargement (sha512 différent). Le `.blockmap` et son `blockMapSize` sont retirés : ils décrivent l'ancien fichier.
// shortcut: pas de blockmap de l'installeur signé, donc chaque mise à jour se télécharge en entier (~115 Mo) ;
// régénérer le blockmap si le poids pèse.

/** Remet à jour `latest.yml` (sha512 en deux endroits, une taille) pour l'installeur signé ; lève si le format change. */
export function majLatest(yml: string, sha512: string, taille: number): string {
  let nSha = 0
  let nTaille = 0
  const sortie = yml
    .replace(/^([ \t]*(?:- )?sha512: )[^\r\n]*/gm, (_, debut: string) => {
      nSha++
      return debut + sha512
    })
    .replace(/^([ \t]+size: )[^\r\n]*/gm, (_, debut: string) => {
      nTaille++
      return debut + taille
    })
    .replace(/^[ \t]+blockMapSize: [^\r\n]*\r?\n/gm, '')
  if (nSha !== 2 || nTaille !== 1) throw new Error(`latest.yml inattendu : ${nSha} sha512 et ${nTaille} size (2 et 1 attendus)`)
  return sortie
}
