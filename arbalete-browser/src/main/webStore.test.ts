import { rejects, strictEqual } from 'node:assert/strict'
import { test } from 'node:test'
import { creerRequeteNet, telechargerCrx, type FabriqueNet, type ReponseHttp, type RequeteHttp } from './webStore.ts'

// Tests du téléchargement d'un .crx (ARB-161) : requête factice, redirections et taille bornées.

const ID = 'eimadpbcbfnmbkopoojfekhnkhdbieeh'
const OPTIONS = { versionChromium: '156.0.8078.80' }

const redirection = (lieu: string): ReponseHttp => ({
  status: 302,
  headers: { get: (n) => (n === 'location' ? lieu : null) },
  body: null
})
const corps = (donnees: Buffer, longueur?: number): ReponseHttp => ({
  status: 200,
  headers: { get: (n) => (n === 'content-length' ? String(longueur ?? donnees.length) : null) },
  body: new Response(new Uint8Array(donnees)).body
})

test('suit la redirection vers l’hôte du Store et rend le fichier', async () => {
  const vus: string[] = []
  const requete: RequeteHttp = async (url) => {
    vus.push(url)
    return vus.length === 1
      ? redirection('https://clients2.googleusercontent.com/crx/blobs/x')
      : corps(Buffer.from('crx!'))
  }
  strictEqual((await telechargerCrx(ID, { ...OPTIONS, requete })).toString(), 'crx!')
  strictEqual(vus[1], 'https://clients2.googleusercontent.com/crx/blobs/x')
})

test('refuse une redirection hors https ou hors des hôtes du Store, et les boucles', async () => {
  for (const lieu of ['http://clients2.googleusercontent.com/x', 'https://evil.example/x', 'file:///c:/x'])
    await rejects(telechargerCrx(ID, { ...OPTIONS, requete: async () => redirection(lieu) }), /Redirection/, lieu)
  await rejects(
    telechargerCrx(ID, { ...OPTIONS, requete: async () => redirection('https://clients2.google.com/boucle') }),
    /Trop de redirections/
  )
})

test('refuse un statut d’erreur et un fichier trop gros (annoncé ou réel)', async () => {
  await rejects(
    telechargerCrx(ID, {
      ...OPTIONS,
      requete: async () => ({ status: 404, headers: { get: () => null }, body: null })
    }),
    /HTTP 404/
  )
  await rejects(
    telechargerCrx(ID, { ...OPTIONS, octetsMax: 10, requete: async () => corps(Buffer.from('court'), 999) }),
    /volumineuse/
  )
  await rejects(
    telechargerCrx(ID, { ...OPTIONS, octetsMax: 10, requete: async () => corps(Buffer.alloc(50)) }),
    /volumineuse/
  )
})

test('l’adaptateur d’net.request rend un 3xx avec son lieu, puis une réponse lisible, sans cookies (ARB-161)', async () => {
  type Ecouteurs = Record<string, (...args: never[]) => void>
  const options: unknown[] = []
  let abandons = 0
  const net: FabriqueNet = {
    request(o) {
      options.push(o)
      const e: Ecouteurs = {}
      return {
        on(nom, f) {
          e[nom] = f
        },
        abort: () => void abandons++,
        end() {
          queueMicrotask(() => {
            if (o.url.endsWith('/a'))
              (e.redirect as (...a: unknown[]) => void)(302, 'GET', 'https://clients2.google.com/b')
            else {
              const m: Ecouteurs = {}
              ;(e.response as (...a: unknown[]) => void)({
                statusCode: 200,
                headers: { 'content-length': ['3'] },
                on: (nom: string, f: (...args: never[]) => void) => void (m[nom] = f)
              })
              ;(m.data as (...a: unknown[]) => void)(Buffer.from('abc'))
              ;(m.end as () => void)()
            }
          })
        }
      }
    }
  }
  const requete = creerRequeteNet(net)
  const init = { redirect: 'manual', credentials: 'omit', signal: AbortSignal.timeout(2000) } as const
  const r1 = await requete('https://clients2.google.com/a', init)
  strictEqual(r1.status, 302)
  strictEqual(r1.headers.get('Location'), 'https://clients2.google.com/b')
  strictEqual(abandons, 1)
  const r2 = await requete('https://clients2.google.com/b', init)
  strictEqual(r2.headers.get('content-length'), '3')
  const lecteur = r2.body!.getReader()
  const { value } = await lecteur.read()
  strictEqual(Buffer.from(value!).toString(), 'abc')
  strictEqual(
    options.every((o) => (o as { credentials: string }).credentials === 'omit'),
    true
  )
})

// Value: protects=un corps de réponse qui ne finit jamais est interrompu par le délai global; fails_when=la lecture du corps n'écoute plus le signal; why_new=les autres tests ne bloquent jamais le flux; seam=none; no_claim=net.request réel (flux factice)
test('un corps qui ne finit pas est interrompu par le délai global', async () => {
  const requete: RequeteHttp = async () => ({
    status: 200,
    headers: { get: () => null },
    body: new ReadableStream<Uint8Array>({ start: (c) => c.enqueue(new Uint8Array([1])) })
  })
  await rejects(telechargerCrx(ID, { ...OPTIONS, requete, delaiMs: 30 }), /délai dépassé/)
})
