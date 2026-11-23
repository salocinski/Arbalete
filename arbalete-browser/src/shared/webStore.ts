// Chrome Web Store (ARB-161, EP-04) : lecture d'un identifiant ou d'un lien, adresse du serveur de mises à jour, hôtes admis
// pour la redirection et comparaison de versions. Fonctions pures, sans réseau.

export const ID_STORE = /^[a-p]{32}$/
const HOTES_STORE = ['chromewebstore.google.com', 'chrome.google.com']

// Identifiant (32 lettres a à p) ou lien de fiche (`…/detail/<nom>/<id>`) ; null si rien d'exploitable.
export function idExtensionStore(entree: string): string | null {
  const texte = entree.trim()
  if (ID_STORE.test(texte)) return texte
  let url: URL
  try {
    url = new URL(texte)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || !HOTES_STORE.includes(url.hostname)) return null
  const segments = url.pathname.split('/').filter(Boolean)
  const i = segments.indexOf('detail')
  if (i < 0) return null
  return (
    segments
      .slice(i + 1)
      .filter((s) => ID_STORE.test(s))
      .at(-1) ?? null
  )
}

// Adresse du serveur de mises à jour du Store : il redirige (302) vers le .crx de la dernière version (POC ARB-26).
export function urlTelechargementStore(id: string, versionChromium: string): string {
  if (!ID_STORE.test(id)) throw new Error('Identifiant d’extension invalide')
  if (!/^\d{1,9}(\.\d{1,9}){0,3}$/.test(versionChromium)) throw new Error('Version de Chromium invalide')
  return (
    'https://clients2.google.com/service/update2/crx?response=redirect' +
    `&prodversion=${versionChromium}&acceptformat=crx3&x=${encodeURIComponent(`id=${id}&uc`)}`
  )
}

// Seuls ces hôtes servent un .crx (la signature du fichier reste vérifiée dans tous les cas).
export function hoteTelechargementAutorise(hote: string): boolean {
  return hote === 'clients2.google.com' || hote === 'clients2.googleusercontent.com' || hote.endsWith('.gvt1.com')
}

// Vrai si `a` est strictement plus récente que `b` (versions de manifest : 1 à 4 nombres séparés par des points).
export function versionPlusRecente(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x > y
  }
  return false
}
