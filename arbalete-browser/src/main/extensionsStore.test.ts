import { deepStrictEqual, rejects, strictEqual, throws } from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { ouvrirBase } from './donnees/base.ts'
import { creerGestionnaireExtensions } from './extensions.ts'
import { fabriquerCle, fabriquerCrx, fabriquerZip } from './fabriqueCrx.ts'

// Tests de l'installation et de la mise à jour depuis le Chrome Web Store (ARB-161) : téléchargement factice, .crx réels
// (signés par une clé de test), vrais fichiers temporaires.

const cle = fabriquerCle()

function crx(version: string, permissions: string[] = ['storage'], signeur = cle, hotes: string[] = []) {
  const manifest = {
    manifest_version: 3,
    name: '__MSG_nom__',
    default_locale: 'fr',
    version,
    permissions,
    host_permissions: hotes
  }
  return fabriquerCrx(
    fabriquerZip([
      { nom: 'manifest.json', contenu: JSON.stringify(manifest) },
      { nom: '_locales/fr/messages.json', contenu: JSON.stringify({ NOM: { message: 'Mon extension' } }) },
      { nom: 'a.js', contenu: 'console.log(1)' }
    ]),
    signeur
  )
}

function monter(depot: { courant: Buffer | Promise<Buffer> }) {
  const dossier = mkdtempSync(join(tmpdir(), 'arb161-'))
  const db = ouvrirBase(':memory:')
  const journal: string[] = []
  const g = creerGestionnaireExtensions<string, string, string>({
    db,
    racine: join(dossier, 'extensions'),
    actif: () => true,
    creerBibliotheque: () => ({ addTab: () => {}, selectTab: () => {}, removeTab: () => {} }),
    charger: async (_s, chemin) => {
      journal.push('charger')
      return 'e-' + chemin.length
    },
    decharger: (_s, id) => journal.push('decharger:' + id),
    telecharger: async () => depot.courant,
    avertir: () => {}
  })
  const copies = () => {
    const racine = join(dossier, 'extensions', '1')
    return existsSync(racine) ? readdirSync(racine) : []
  }
  return { g, journal, copies, nettoyer: () => rmSync(dossier, { recursive: true, force: true }) }
}

test('installe depuis un lien du Store : inactive, source notée, nom localisé résolu', async () => {
  const m = monter({ courant: crx('1.0.0') })
  try {
    await m.g.preparer(1, 's')
    const id = await m.g.installerDepuisStore(1, `https://chromewebstore.google.com/detail/mon-extension/${cle.id}`)
    const [e] = m.g.lister(1)
    deepStrictEqual(
      [e.id, e.nom, e.version, e.actif, e.storeId, e.permissions],
      [id, 'Mon extension', '1.0.0', false, cle.id, ['storage']]
    )
    strictEqual(m.copies().length, 1)
    await rejects(m.g.installerDepuisStore(1, cle.id), /déjà installée/)
  } finally {
    m.nettoyer()
  }
})

test('refuse une entrée invalide, un .crx mal signé ou d’une autre extension, sans laisser de copie', async () => {
  const depot: { courant: Buffer | Promise<Buffer> } = { courant: crx('1.0.0') }
  const m = monter(depot)
  try {
    await rejects(m.g.installerDepuisStore(1, 'pas un identifiant'), /invalide/)
    depot.courant = fabriquerCrx(fabriquerZip([{ nom: 'manifest.json', contenu: '{}' }]), cle, {
      falsifierSignature: true
    })
    await rejects(m.g.installerDepuisStore(1, cle.id), /Signature/)
    depot.courant = crx('1.0.0', ['storage'], fabriquerCle()) // signé par une autre clé : autre identifiant
    await rejects(m.g.installerDepuisStore(1, cle.id), /Signature/)
    depot.courant = fabriquerCrx(fabriquerZip([{ nom: 'manifest.json', contenu: '{"manifest_version":2}' }]), cle)
    await rejects(m.g.installerDepuisStore(1, cle.id), /Manifest V3/)
    deepStrictEqual(m.g.lister(1), [])
    deepStrictEqual(m.copies(), [])
  } finally {
    m.nettoyer()
  }
})

test('deux téléchargements de la même extension en même temps : le second est refusé', async () => {
  let ouvrir!: (b: Buffer) => void
  const m = monter({ courant: new Promise<Buffer>((r) => (ouvrir = r)) })
  try {
    const premier = m.g.installerDepuisStore(1, cle.id)
    await rejects(m.g.installerDepuisStore(1, cle.id), /déjà en cours/)
    ouvrir(crx('1.0.0'))
    await premier
    strictEqual(m.g.lister(1).length, 1)
  } finally {
    m.nettoyer()
  }
})

test('mettre à jour : même version = déjà à jour, sans copie en plus', async () => {
  const depot = { courant: crx('1.0.0') }
  const m = monter(depot)
  try {
    const id = await m.g.installerDepuisStore(1, cle.id)
    strictEqual(await m.g.mettreAJour(1, id), 'a-jour')
    strictEqual(m.copies().length, 1)
    depot.courant = crx('0.9.0')
    strictEqual(await m.g.mettreAJour(1, id), 'a-jour')
    strictEqual(m.g.lister(1)[0].version, '1.0.0')
  } finally {
    m.nettoyer()
  }
})

test('mettre à jour : version plus récente, ancienne copie effacée, extension active rechargée', async () => {
  const depot = { courant: crx('1.0.0') }
  const m = monter(depot)
  try {
    await m.g.preparer(1, 's')
    const id = await m.g.installerDepuisStore(1, cle.id)
    await m.g.definirActive(1, id, true)
    const avant = m.copies()
    depot.courant = crx('1.1.0')
    strictEqual(await m.g.mettreAJour(1, id), 'mise-a-jour')
    const [e] = m.g.lister(1)
    deepStrictEqual([e.version, e.actif], ['1.1.0', true])
    const apres = m.copies()
    strictEqual(apres.length, 1)
    strictEqual(apres[0] !== avant[0], true)
    strictEqual(m.journal.filter((j) => j === 'charger').length, 2)
    strictEqual(m.journal.filter((j) => j.startsWith('decharger')).length, 1)
  } finally {
    m.nettoyer()
  }
})

test('mettre à jour : des permissions élargies remettent l’extension inactive, sans la recharger', async () => {
  const depot = { courant: crx('1.0.0', ['storage']) }
  const m = monter(depot)
  try {
    await m.g.preparer(1, 's')
    const id = await m.g.installerDepuisStore(1, cle.id)
    await m.g.definirActive(1, id, true)
    depot.courant = crx('2.0.0', ['storage', 'cookies', '<all_urls>'])
    strictEqual(await m.g.mettreAJour(1, id), 'mise-a-jour')
    const [e] = m.g.lister(1)
    deepStrictEqual([e.version, e.actif, e.permissions], ['2.0.0', false, ['storage', 'cookies', '<all_urls>']])
    strictEqual(m.journal.filter((j) => j === 'charger').length, 1)
    strictEqual(m.journal.filter((j) => j.startsWith('decharger')).length, 1)
  } finally {
    m.nettoyer()
  }
})

test('mettre à jour une extension de dossier, ou retirée pendant le téléchargement, est refusé', async () => {
  let ouvrir!: (b: Buffer) => void
  const depot: { courant: Buffer | Promise<Buffer> } = { courant: crx('1.0.0') }
  const m = monter(depot)
  try {
    await rejects(m.g.mettreAJour(1, 999), /non installée/)
    const src = mkdtempSync(join(tmpdir(), 'arb161-src-'))
    try {
      writeFileSync(
        join(src, 'manifest.json'),
        JSON.stringify({ manifest_version: 3, name: 'Local', version: '1.0.0' })
      )
      const local = m.g.installer(1, src)
      await rejects(m.g.mettreAJour(1, local), /non installée/) // extension de dossier : rien à télécharger
      m.g.supprimer(1, local)
    } finally {
      rmSync(src, { recursive: true, force: true })
    }
    const id = await m.g.installerDepuisStore(1, cle.id)
    depot.courant = new Promise<Buffer>((r) => (ouvrir = r))
    const maj = m.g.mettreAJour(1, id)
    m.g.supprimer(1, id)
    ouvrir(crx('3.0.0'))
    await rejects(maj, /retirée/)
    deepStrictEqual(m.copies(), [])
  } finally {
    m.nettoyer()
  }
})

// Value: protects=un manifest.json d'un dossier est lu avec BOM et refusé au-delà de 1 Mo; fails_when=le BOM n'est plus retiré ou la taille n'est plus bornée; why_new=extensions.test.ts ne couvre pas lireManifest; seam=none; no_claim=none beyond protects
test('un manifest.json avec BOM est lu, un manifest de plus de 1 Mo est refusé', () => {
  const m = monter({ courant: crx('1.0.0') })
  const src = mkdtempSync(join(tmpdir(), 'arb161-bom-'))
  try {
    const manifest = JSON.stringify({ manifest_version: 3, name: 'Avec BOM', version: '1.0.0' })
    writeFileSync(join(src, 'manifest.json'), String.fromCharCode(0xfeff) + manifest)
    const id = m.g.installer(1, src)
    strictEqual(m.g.lister(1).find((e) => e.id === id)?.nom, 'Avec BOM')
    writeFileSync(join(src, 'manifest.json'), manifest + ' '.repeat(1024 * 1024))
    throws(() => m.g.installer(1, src), /trop volumineux/)
  } finally {
    rmSync(src, { recursive: true, force: true })
    m.nettoyer()
  }
})

// Value: protects=des host_permissions seules élargies par une mise à jour remettent l'extension inactive; fails_when=la comparaison ne couvre plus host_permissions; why_new=le test voisin n'élargit que permissions; seam=none; no_claim=content_scripts (même chemin dans validerManifest)
test('mettre à jour : des host_permissions élargies seules remettent l’extension inactive', async () => {
  const depot = { courant: crx('1.0.0', [], cle, ['https://a.example/*']) }
  const m = monter(depot)
  try {
    await m.g.preparer(1, 's')
    const id = await m.g.installerDepuisStore(1, cle.id)
    await m.g.definirActive(1, id, true)
    depot.courant = crx('2.0.0', [], cle, ['https://a.example/*', 'https://*/*'])
    strictEqual(await m.g.mettreAJour(1, id), 'mise-a-jour')
    strictEqual(m.g.lister(1)[0].actif, false)
  } finally {
    m.nettoyer()
  }
})
