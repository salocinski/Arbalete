import { deepStrictEqual, rejects, strictEqual, throws } from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { ouvrirBase } from './donnees/base.ts'
import { creerProfil, supprimerProfil } from './donnees/profils.ts'
import { creerGestionnaireExtensions } from './extensions.ts'

// Tests unitaires du gestionnaire d'extensions (ARB-144) : bibliothèque et session factices, vrais fichiers temporaires.

const MANIFEST = { manifest_version: 3, name: 'Dark Reader', version: '4.9.1', permissions: ['storage'] }

function monter(opts: { actif?: boolean; echecCreation?: boolean; echecCharge?: boolean } = {}) {
  const dossier = mkdtempSync(join(tmpdir(), 'arb144-'))
  const source = join(dossier, 'source')
  mkdirSync(join(source, 'sous'), { recursive: true })
  writeFileSync(join(source, 'manifest.json'), JSON.stringify(MANIFEST))
  writeFileSync(join(source, 'sous', 'a.js'), '1')
  const db = ouvrirBase(':memory:')
  const journal: string[] = []
  let actif = opts.actif ?? true
  const g = creerGestionnaireExtensions<string, string, string>({
    db,
    racine: join(dossier, 'extensions'),
    actif: () => actif,
    creerBibliotheque: (session) => {
      if (opts.echecCreation) throw new Error('boum')
      journal.push('creer:' + session)
      return {
        addTab: (c) => journal.push('add:' + c),
        selectTab: (c) => journal.push('select:' + c),
        removeTab: (c) => journal.push('remove:' + c)
      }
    },
    charger: async (_s, chemin) => {
      if (opts.echecCharge) throw new Error('chargement refusé')
      journal.push('charger')
      return 'e-' + chemin.length
    },
    decharger: (_s, id) => journal.push('decharger:' + id),
    avertir: () => {}
  })
  return {
    g,
    db,
    dossier,
    source,
    journal,
    nettoyer: () => rmSync(dossier, { recursive: true, force: true }),
    regler: (v: boolean) => (actif = v)
  }
}

test('installer copie le dossier, valide le manifest et enregistre l’extension inactive', () => {
  const m = monter()
  try {
    const id = m.g.installer(1, m.source)
    const [e] = m.g.lister(1)
    deepStrictEqual([e.id, e.nom, e.version, e.actif, e.permissions], [id, 'Dark Reader', '4.9.1', false, ['storage']])
    const copies = readdirSync(join(m.dossier, 'extensions', '1'))
    strictEqual(copies.length, 1)
    strictEqual(existsSync(join(m.dossier, 'extensions', '1', copies[0], 'sous', 'a.js')), true)
  } finally {
    m.nettoyer()
  }
})

test('installer refuse manifest absent, V2, lien symbolique et laisse aucune copie', () => {
  const m = monter()
  try {
    throws(() => m.g.installer(1, join(m.dossier, 'vide')))
    writeFileSync(join(m.source, 'manifest.json'), JSON.stringify({ ...MANIFEST, manifest_version: 2 }))
    throws(() => m.g.installer(1, m.source))
    writeFileSync(join(m.source, 'manifest.json'), JSON.stringify(MANIFEST))
    let lienPossible = true
    try {
      symlinkSync(join(m.dossier, 'ailleurs'), join(m.source, 'lien'))
    } catch {
      lienPossible = false // droits Windows : le test du lien est sauté
    }
    if (lienPossible) throws(() => m.g.installer(1, m.source), /Lien symbolique/)
    deepStrictEqual(m.g.lister(1), [])
    const racine = join(m.dossier, 'extensions', '1')
    deepStrictEqual(existsSync(racine) ? readdirSync(racine) : [], [])
  } finally {
    m.nettoyer()
  }
})

test('réglage maître faux : rien n’est créé ni chargé, même pour une extension active', async () => {
  const m = monter({ actif: false })
  try {
    const id = m.g.installer(1, m.source)
    await m.g.definirActive(1, id, true)
    await m.g.preparer(1, 's1')
    deepStrictEqual(m.journal, [])
    strictEqual(m.g.lister(1)[0].actif, true)
  } finally {
    m.nettoyer()
  }
})

test('préparer charge les extensions actives ; activer et désactiver chargent et déchargent', async () => {
  const m = monter()
  try {
    const id = m.g.installer(1, m.source)
    await m.g.preparer(1, 's1')
    deepStrictEqual(m.journal, ['creer:s1'])
    await m.g.definirActive(1, id, true)
    strictEqual(m.journal.at(-1), 'charger')
    await m.g.definirActive(1, id, false)
    strictEqual(m.journal.at(-1)?.startsWith('decharger:'), true)
    strictEqual(m.g.lister(1)[0].actif, false)
    await m.g.definirActive(1, 999, true) // inconnue : sans effet
  } finally {
    m.nettoyer()
  }
})

test('un chargement qui échoue marque l’extension en erreur sans faire échouer le gestionnaire', async () => {
  const m = monter({ echecCharge: true })
  try {
    const id = m.g.installer(1, m.source)
    await m.g.preparer(1, 's1')
    await m.g.definirActive(1, id, true)
    strictEqual(m.g.lister(1)[0].erreur, true)
  } finally {
    m.nettoyer()
  }
})

test('une bibliothèque qui ne se crée pas laisse le navigateur sans extensions, onglets ignorés', async () => {
  const m = monter({ echecCreation: true })
  try {
    m.g.installer(1, m.source)
    await m.g.preparer(1, 's1')
    m.g.ajouterOnglet(1, 'wc', 'fenetre')
    deepStrictEqual(m.journal, [])
  } finally {
    m.nettoyer()
  }
})

test('les onglets sont suivis par la bibliothèque du profil, pas celle d’un autre', async () => {
  const m = monter()
  try {
    const travail = creerProfil(m.db, 'Travail')
    await m.g.preparer(1, 's1')
    m.g.ajouterOnglet(1, 'a', 'f')
    m.g.selectionnerOnglet(1, 'a')
    m.g.retirerOnglet(1, 'a')
    m.g.ajouterOnglet(travail, 'b', 'f') // profil non préparé : sans effet
    deepStrictEqual(m.journal, ['creer:s1', 'add:a', 'select:a', 'remove:a'])
  } finally {
    m.nettoyer()
  }
})

test('supprimer décharge, retire la ligne et efface la copie ; l’extension d’un autre profil est refusée', async () => {
  const m = monter()
  try {
    const travail = creerProfil(m.db, 'Travail')
    const id = m.g.installer(1, m.source)
    await m.g.preparer(1, 's1')
    await m.g.definirActive(1, id, true)
    m.g.supprimer(travail, id) // pas son profil : rien
    strictEqual(m.g.lister(1).length, 1)
    m.g.supprimer(1, id)
    deepStrictEqual(m.g.lister(1), [])
    deepStrictEqual(readdirSync(join(m.dossier, 'extensions', '1')), [])
    await rejects(Promise.resolve().then(() => m.g.installer(1, join(m.dossier, 'nulle part'))))
  } finally {
    m.nettoyer()
  }
})

test('effacerProfil efface les copies avant la suppression du profil et sa cascade', () => {
  const m = monter()
  try {
    const travail = creerProfil(m.db, 'Travail')
    m.g.installer(travail, m.source)
    strictEqual(readdirSync(join(m.dossier, 'extensions', String(travail))).length, 1)
    const copies = m.g.copies(travail)
    supprimerProfil(m.db, travail)
    m.g.effacerProfil(travail, copies)
    deepStrictEqual(readdirSync(join(m.dossier, 'extensions', String(travail))), [])
    deepStrictEqual(m.g.lister(travail), [])
  } finally {
    m.nettoyer()
  }
})
