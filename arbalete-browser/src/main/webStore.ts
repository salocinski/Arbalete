import { hoteTelechargementAutorise, urlTelechargementStore } from '../shared/webStore.ts'
import { TAILLE_MAX_COPIE } from './extensions.ts'

// Téléchargement d'un .crx depuis le serveur de mises à jour du Chrome Web Store (ARB-161, POC ARB-26) : https seulement,
// redirections suivies à la main (4 au plus, chaque hôte vérifié), taille bornée, délai global. La signature du fichier est
// vérifiée ensuite par `lireCrx` : ces garde-fous limitent d'abord ce que le réseau peut nous faire lire.

export type ReponseHttp = {
  status: number
  headers: { get(nom: string): string | null }
  body: ReadableStream<Uint8Array> | null
}
export type RequeteHttp = (
  url: string,
  init: { redirect: 'manual'; credentials: 'omit'; signal: AbortSignal }
) => Promise<ReponseHttp>

// Adaptateur d'`net.request` d'Electron vers `RequeteHttp` : `net.fetch` avec `redirect: 'manual'` lève « Redirect was cancelled » sous
// Electron 45 au lieu de rendre le 3xx (sondé). Ici l'événement `redirect` est rendu comme une réponse 3xx avec son `location`, et
// `telechargerCrx` refait lui-même la requête suivante après avoir vérifié l'hôte.
type MessageNet = {
  statusCode: number
  headers: Record<string, string | string[]>
  on(evenement: 'data' | 'end' | 'error', ecouteur: (arg: never) => void): unknown
}
type DemandeNet = {
  on(evenement: string, ecouteur: (...args: never[]) => void): unknown
  end(): void
  abort(): void
}
export type FabriqueNet = { request(options: { url: string; redirect: 'manual'; credentials: 'omit' }): DemandeNet }

export function creerRequeteNet(net: FabriqueNet): RequeteHttp {
  return (url, init) =>
    new Promise<ReponseHttp>((resolve, reject) => {
      const demande = net.request({ url, redirect: 'manual', credentials: 'omit' })
      const arreter = () => {
        demande.abort()
        reject(new Error('Téléchargement interrompu'))
      }
      if (init.signal.aborted) return arreter()
      init.signal.addEventListener('abort', arreter, { once: true })
      demande.on('error', (erreur: Error) => reject(erreur))
      demande.on('redirect', (statut: number, _methode: string, lieu: string) => {
        demande.abort() // c'est `telechargerCrx` qui décide de la suite
        resolve({
          status: statut,
          headers: { get: (nom) => (nom.toLowerCase() === 'location' ? lieu : null) },
          body: null
        })
      })
      demande.on('response', (message: MessageNet) => {
        const entetes = message.headers
        let annule = false
        const corps = new ReadableStream<Uint8Array>({
          start(controleur) {
            // après `cancel()` le flux est fermé : un `data` ou un `end` déjà en vol ne doit pas lever dans le main
            const sur = (f: () => void) => () => {
              if (!annule) f()
            }
            message.on('data', (morceau: Buffer) => sur(() => controleur.enqueue(new Uint8Array(morceau)))())
            message.on(
              'end',
              sur(() => controleur.close())
            )
            message.on('error', (erreur: Error) => sur(() => controleur.error(erreur))())
          },
          cancel() {
            annule = true
            demande.abort()
          }
        })
        const lire = (nom: string) => {
          const v = entetes[nom.toLowerCase()]
          return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
        }
        resolve({ status: message.statusCode, headers: { get: lire }, body: corps })
      })
      demande.end()
    })
}

const REDIRECTIONS_MAX = 4
export const DELAI_TELECHARGEMENT = 120_000

export async function telechargerCrx(
  idStore: string,
  options: { requete: RequeteHttp; versionChromium: string; delaiMs?: number; octetsMax?: number }
): Promise<Buffer> {
  const octetsMax = options.octetsMax ?? TAILLE_MAX_COPIE
  const signal = AbortSignal.timeout(options.delaiMs ?? DELAI_TELECHARGEMENT)
  let url = urlTelechargementStore(idStore, options.versionChromium)
  for (let saut = 0; saut <= REDIRECTIONS_MAX; saut++) {
    const reponse = await options.requete(url, { redirect: 'manual', credentials: 'omit', signal }) // sans les cookies Google de l'utilisateur
    if (reponse.status >= 300 && reponse.status < 400) {
      const lieu = reponse.headers.get('location')
      if (!lieu) throw new Error('Redirection invalide du Chrome Web Store')
      const suite = new URL(lieu, url)
      if (suite.protocol !== 'https:' || !hoteTelechargementAutorise(suite.hostname))
        throw new Error('Redirection refusée : hôte non autorisé')
      url = suite.href
      continue
    }
    if (reponse.status !== 200 || !reponse.body) throw new Error(`Téléchargement refusé (HTTP ${reponse.status})`)
    const annonce = Number(reponse.headers.get('content-length'))
    if (Number.isFinite(annonce) && annonce > octetsMax) throw new Error('Extension trop volumineuse')
    const morceaux: Uint8Array[] = []
    let total = 0
    const lecteur = reponse.body.getReader()
    signal.addEventListener('abort', () => void lecteur.cancel().catch(() => {}), { once: true }) // corps qui ne finit jamais
    for (;;) {
      const { done, value } = await lecteur.read()
      if (done) break
      total += value.length
      if (total > octetsMax) {
        await lecteur.cancel()
        throw new Error('Extension trop volumineuse')
      }
      morceaux.push(value)
    }
    if (signal.aborted) throw new Error('Téléchargement interrompu : délai dépassé')
    return Buffer.concat(morceaux)
  }
  throw new Error('Trop de redirections du Chrome Web Store')
}
