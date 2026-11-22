import { deepStrictEqual, rejects, strictEqual, throws } from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { ouvrirBase } from './base.ts'
import { creerEspace, lireEspaces } from './espaces.ts'
import { basculerFavori, creerDossier, deplacerFavori, listerFavoris } from './favoris.ts'
import { ajouterVisite, listerHistorique, lirePage } from './historique.ts'
import { ecrireExport, construireExport, importerExport, lireExport, VERSION_EXPORT } from './exportDonnees.ts'
import { archiver, listerArchive } from './archive.ts'
import { definirProfilEspace, creerProfil, lireProfils } from './profils.ts'
import { essaiEnTransaction } from './transaction.ts'
import { definirPermissionSite, lirePermissionSite } from './permissionsSites.ts'
import { ecrireReglages, ecrireMoteur, ecrireTheme, lireMoteur, lireReglages, lireTheme } from './preferences.ts'

// Tests unitaires de l'export et de l'import des données (ARB-79).

// Adresse portant un nom et un mot de passe, sans les écrire en toutes lettres dans le fichier (détecteur de secrets).
function avecIdentifiants(adresse: string): string {
  const url = new URL(adresse)
  url.username = 'nom'
  url.password = 'mot'
  return url.href
}

function remplir() {
  const db = ouvrirBase(':memory:')
  const dossier = creerDossier(db, 'Travail')
  basculerFavori(db, 'https://example.com/a', 'A', 1000)
  basculerFavori(db, 'https://example.com/b', 'B', 2000)
  deplacerFavori(
    db,
    Number(db.prepare('SELECT id FROM favori WHERE url = ?').get('https://example.com/b')!.id),
    dossier
  )
  ajouterVisite(db, 'https://example.com/a', 'A', 5000)
  ajouterVisite(db, 'https://example.com/a', 'A', 6000)
  ajouterVisite(db, 'https://example.org/', 'Org', 7000)
  creerEspace(db, { nom: 'Perso', couleur: 'personal', icone: '🏠' })
  ecrireTheme(db, 'dark')
  ecrireMoteur(db, { id: 'duckduckgo', modele: '' })
  ecrireReglages(db, {
    accueil: 'https://exemple.fr/',
    animationsReduites: true,
    dossierTelechargements: 'C:\\Perso',
    archivageHeures: 24,
    veilleMinutes: 60
  })
  return db
}

test('export puis import dans une base vide : tout revient, sauf le dossier de téléchargement', () => {
  const source = remplir()
  const fichier = JSON.stringify(construireExport(source, 42))
  const cible = ouvrirBase(':memory:')
  const bilan = importerExport(cible, lireExport(fichier))
  deepStrictEqual(bilan, {
    favoris: 2,
    pages: 2,
    espaces: 1,
    profils: 0,
    permissions: 0,
    archive: 0,
    conflits: 0,
    reglages: true
  })
  const liste = listerFavoris(cible)
  deepStrictEqual(
    liste.dossiers.map((d) => d.nom),
    ['Travail']
  )
  deepStrictEqual(
    liste.favoris.map((f) => [
      f.url,
      f.titre,
      f.dossier === null ? null : liste.dossiers.find((d) => d.id === f.dossier)!.nom
    ]),
    [
      ['https://example.com/a', 'A', null],
      ['https://example.com/b', 'B', 'Travail']
    ]
  )
  strictEqual(lirePage(cible, 'https://example.com/a')!.visites, 2)
  strictEqual(lirePage(cible, 'https://example.com/a')!.derniereVisite, 6000)
  strictEqual(listerHistorique(cible, '').length, 2) // une ligne par page et par jour
  deepStrictEqual(
    lireEspaces(cible).map((e) => e.nom),
    ['Perso']
  )
  strictEqual(lireTheme(cible), 'dark')
  strictEqual(lireMoteur(cible).id, 'duckduckgo')
  deepStrictEqual(lireReglages(cible), {
    accueil: 'https://exemple.fr/',
    animationsReduites: true,
    dossierTelechargements: null,
    archivageHeures: 24,
    veilleMinutes: 60
  })
})

test('rejouer un import ne change rien', () => {
  const donnees = lireExport(JSON.stringify(construireExport(remplir())))
  const cible = ouvrirBase(':memory:')
  importerExport(cible, donnees)
  const avant = JSON.stringify(construireExport(cible, 0))
  deepStrictEqual(importerExport(cible, donnees), {
    favoris: 0,
    pages: 0,
    espaces: 0,
    profils: 0,
    permissions: 0,
    archive: 0,
    conflits: 0,
    reglages: true
  })
  strictEqual(JSON.stringify(construireExport(cible, 0)), avant)
})

test('l’import ne supprime ni ne remplace : favori existant gardé, visites ajoutées', () => {
  const cible = ouvrirBase(':memory:')
  basculerFavori(cible, 'https://example.com/a', 'Mon titre', 9)
  ajouterVisite(cible, 'https://example.com/a', 'Mon titre', 100)
  basculerFavori(cible, 'https://autre.fr/', 'Autre', 10)
  importerExport(cible, lireExport(JSON.stringify(construireExport(remplir()))))
  deepStrictEqual(
    { ...cible.prepare('SELECT titre, date FROM favori WHERE url = ?').get('https://example.com/a') },
    { titre: 'Mon titre', date: 9 }
  )
  strictEqual(listerFavoris(cible).favoris.length, 3)
  const page = lirePage(cible, 'https://example.com/a')!
  strictEqual(page.titre, 'Mon titre')
  strictEqual(page.visites, 3)
  strictEqual(page.derniereVisite, 6000)
})

test('un espace du même nom n’est pas recréé', () => {
  const cible = ouvrirBase(':memory:')
  creerEspace(cible, { nom: 'Perso', couleur: 'work', icone: 'x' })
  importerExport(cible, lireExport(JSON.stringify(construireExport(remplir()))))
  deepStrictEqual(
    lireEspaces(cible).map((e) => [e.nom, e.couleur]),
    [['Perso', 'work']]
  )
})

test('un fichier étranger, illisible ou plus récent est refusé', () => {
  throws(() => lireExport('pas du json'), /illisible/)
  throws(() => lireExport('[]'), /pas un export/)
  throws(() => lireExport(JSON.stringify({ format: 'autre', version: 1 })), /pas un export/) // pregate-literal: VERSION_EXPORT=1 format étranger refusé avant la version
  throws(() => lireExport(JSON.stringify({ format: 'arbalete-donnees', version: VERSION_EXPORT + 1 })), /plus récente/) // pregate-literal: VERSION_EXPORT=1 le « + 1 » est la version suivante
  throws(() => lireExport(JSON.stringify({ format: 'arbalete-donnees', version: 'x' })), /Version/)
})

test('un dossier du même nom est réutilisé, pas dupliqué', () => {
  const cible = ouvrirBase(':memory:')
  creerDossier(cible, 'Travail')
  importerExport(cible, lireExport(JSON.stringify(construireExport(remplir()))))
  deepStrictEqual(
    listerFavoris(cible).dossiers.map((d) => d.nom),
    ['Travail']
  )
  strictEqual(listerFavoris(cible).favoris.filter((f) => f.dossier !== null).length, 1)
})

test('une version nulle ou non entière est refusée', () => {
  for (const version of [0, 1.5, -1])
    throws(() => lireExport(JSON.stringify({ format: 'arbalete-donnees', version })), /Version/)
})

test('les entrées invalides sont ignorées, pas le reste', () => {
  const donnees = lireExport(
    JSON.stringify({
      format: 'arbalete-donnees',
      version: 1, // pregate-literal: VERSION_EXPORT=1 fichier de version 1, toujours lisible
      exporteLe: 'hier',
      favoris: {
        dossiers: ['', 12, 'Ok'],
        favoris: [
          { url: 'javascript:alert(1)', titre: 'x' },
          { url: 'file:///C:/a', titre: 'x' },
          7,
          null,
          { url: avecIdentifiants('https://example.com/p#frag'), titre: 'Bon', date: -5, dossier: 'Ok' } // identifiants et fragment retirés
        ]
      },
      historique: [
        { url: 'data:text/html,x', dates: [1] },
        { url: 'https://example.com/', dates: ['a', -1, 1.5, 3000] },
        { url: 'https://vide.fr/', dates: [] }
      ],
      espaces: [
        { nom: 'Mauvaise', couleur: 'inconnue', icone: 'x' },
        { nom: 'x'.repeat(41), couleur: 'work', icone: 'x' },
        { nom: 'Bonne', couleur: 'work', icone: 'x' }
      ],
      reglages: {
        theme: 'neon',
        moteur: { id: 'inconnu' },
        accueil: 'ftp://x',
        animationsReduites: 'oui',
        archivageHeures: 5,
        veilleMinutes: 30
      }
    })
  )
  strictEqual(donnees.exporteLe, 0)
  deepStrictEqual(donnees.favoris.dossiers, ['Ok'])
  deepStrictEqual(
    donnees.favoris.favoris.map((f) => [f.url, f.dossier]),
    [['https://example.com/p', 'Ok']]
  )
  deepStrictEqual(donnees.historique, [{ url: 'https://example.com/', titre: '', dates: [3000] }])
  deepStrictEqual(
    donnees.espaces.map((e) => e.nom),
    ['Bonne']
  )
  deepStrictEqual(donnees.reglages, { veilleMinutes: 30 })
})

test('un BOM est toléré et une date future est ignorée', () => {
  const futur = Date.now() + 10 * 86_400_000
  const donnees = lireExport(
    '﻿' +
      JSON.stringify({
        format: 'arbalete-donnees',
        version: 1, // pregate-literal: VERSION_EXPORT=1 fichier de version 1, toujours lisible
        historique: [{ url: 'https://example.com/', dates: [futur, 3000] }]
      })
  )
  deepStrictEqual(donnees.historique, [{ url: 'https://example.com/', titre: '', dates: [3000] }])
})

test('une visite à date future en base n’empêche pas l’export', () => {
  const db = ouvrirBase(':memory:')
  ajouterVisite(db, 'https://example.com/', 'A', 5000)
  ajouterVisite(db, 'https://futur.fr/', 'F', Date.now() + 30 * 86_400_000)
  const dossier = mkdtempSync(join(tmpdir(), 'arbalete-export-'))
  try {
    deepStrictEqual(ecrireExport(join(dossier, 'x.json'), construireExport(db)), {
      favoris: 0,
      pages: 1,
      profils: 0,
      permissions: 0,
      archive: 0
    })
  } finally {
    rmSync(dossier, { recursive: true, force: true })
  }
})

test('un import sans réglages ne touche pas aux réglages', () => {
  const cible = ouvrirBase(':memory:')
  ecrireTheme(cible, 'light')
  const donnees = lireExport(JSON.stringify({ format: 'arbalete-donnees', version: 1 })) // pregate-literal: VERSION_EXPORT=1 fichier de version 1, toujours lisible
  deepStrictEqual(importerExport(cible, donnees), {
    favoris: 0,
    pages: 0,
    espaces: 0,
    profils: 0,
    permissions: 0,
    archive: 0,
    conflits: 0,
    reglages: false
  })
  strictEqual(lireTheme(cible), 'light')
})

test('un import qui échoue en cours de route n’écrit rien', () => {
  const cible = ouvrirBase(':memory:')
  const donnees = lireExport(JSON.stringify(construireExport(remplir())))
  // Un espace invalide glissé après validation fait lever creerEspace en fin de transaction.
  donnees.espaces.push({ nom: '', couleur: 'work', icone: 'x' })
  throws(() => importerExport(cible, donnees))
  strictEqual(listerFavoris(cible).favoris.length, 0)
  strictEqual(listerHistorique(cible, '').length, 0)
  strictEqual(lireTheme(cible), 'system')
})

test('l’export est écrit sans fichier provisoire et un échec laisse l’ancien fichier intact', async () => {
  const dossier = mkdtempSync(join(tmpdir(), 'arbalete-export-'))
  try {
    const chemin = join(dossier, 'sauvegarde.json')
    const donnees = construireExport(remplir())
    deepStrictEqual(ecrireExport(chemin, donnees), { favoris: 2, pages: 2, profils: 0, permissions: 0, archive: 0 })
    deepStrictEqual(readdirSync(dossier), ['sauvegarde.json'])
    strictEqual(lireExport(readFileSync(chemin, 'utf8')).favoris.favoris.length, 2)

    writeFileSync(chemin, 'ancien')
    // Un favori hors du web ne survit pas à la relecture : l'export est refusé avant le renommage.
    const incomplet = {
      ...donnees,
      favoris: {
        ...donnees.favoris,
        favoris: [...donnees.favoris.favoris, { url: 'about:blank', titre: '', date: 1, dossier: null }]
      }
    }
    throws(() => ecrireExport(chemin, incomplet), /incomplet/)
    strictEqual(readFileSync(chemin, 'utf8'), 'ancien')
    deepStrictEqual(readdirSync(dossier), ['sauvegarde.json'])
    await rejects(Promise.resolve().then(() => ecrireExport(join(dossier, 'absent', 'x.json'), donnees)))
  } finally {
    rmSync(dossier, { recursive: true, force: true })
  }
})

// Sauvegarde complète (ARB-146).
function remplirComplet() {
  const db = remplir()
  const pro = creerProfil(db, 'Pro')
  const espace = lireEspaces(db).find((e) => e.nom === 'Perso')!.id
  definirProfilEspace(db, espace, pro)
  definirPermissionSite(db, 'exemple.fr', 'micro', 'refuser')
  definirPermissionSite(db, 'exemple.fr', 'camera', 'autoriser') // une autorisation ne s'importe jamais
  definirPermissionSite(db, `${pro}@exemple.fr`, 'camera', 'refuser')
  archiver(db, [{ url: 'https://example.com/vieux', titre: 'Vieux', espace: null }], 3000)
  db.prepare('INSERT INTO onglet (position, url, titre, actif, espace) VALUES (0, ?, ?, 1, ?)').run(
    'https://example.com/ouvert',
    'Ouvert',
    espace
  )
  return { db, pro }
}

test('un export simple ne porte ni profils, ni permissions, ni archive', () => {
  const { db } = remplirComplet()
  const simple = construireExport(db, 42)
  strictEqual(simple.profils, undefined)
  strictEqual(simple.permissions, undefined)
  strictEqual(simple.archive, undefined)
  strictEqual(simple.onglets, undefined)
  strictEqual(simple.espaces[0].profil, undefined)
})

test('sauvegarde complète : profils, permissions, archive et onglets reviennent dans une base vide', () => {
  const { db } = remplirComplet()
  const fichier = JSON.stringify(construireExport(db, 4242, true))
  const cible = ouvrirBase(':memory:')
  const bilan = importerExport(cible, lireExport(fichier))
  deepStrictEqual(bilan, {
    favoris: 2,
    pages: 2,
    espaces: 1,
    profils: 1,
    permissions: 2,
    archive: 2,
    conflits: 0,
    reglages: true
  })
  const pro = lireProfils(cible).find((p) => p.nom === 'Pro')!
  strictEqual(lireEspaces(cible).find((e) => e.nom === 'Perso')!.profil, pro.id)
  strictEqual(lirePermissionSite(cible, 'exemple.fr', 'micro'), 'refuser')
  strictEqual(lirePermissionSite(cible, 'exemple.fr', 'camera'), undefined)
  strictEqual(lirePermissionSite(cible, `${pro.id}@exemple.fr`, 'camera'), 'refuser')
  deepStrictEqual(
    listerArchive(cible)
      .map((a) => a.url)
      .sort(),
    ['https://example.com/ouvert', 'https://example.com/vieux']
  )
})

test('restauration : rejouer ne change rien, une permission déjà réglée est gardée et comptée', () => {
  const { db } = remplirComplet()
  const donnees = lireExport(JSON.stringify(construireExport(db, 4242, true)))
  const cible = ouvrirBase(':memory:')
  definirPermissionSite(cible, 'exemple.fr', 'micro', 'autoriser')
  const premier = importerExport(cible, donnees)
  strictEqual(premier.conflits, 1)
  strictEqual(premier.permissions, 1)
  strictEqual(lirePermissionSite(cible, 'exemple.fr', 'micro'), 'autoriser')
  const second = importerExport(cible, donnees)
  deepStrictEqual(second, {
    favoris: 0,
    pages: 0,
    espaces: 0,
    profils: 0,
    permissions: 0,
    archive: 0,
    conflits: 1,
    reglages: true
  })
  strictEqual(listerArchive(cible).length, 2)
  strictEqual(lireProfils(cible).length, 2)
})

test('l’essai annule tout : même bilan que la restauration, base inchangée', () => {
  const { db } = remplirComplet()
  const donnees = lireExport(JSON.stringify(construireExport(db, 4242, true)))
  const cible = ouvrirBase(':memory:')
  const essai = importerExport(cible, donnees, true)
  strictEqual(lireProfils(cible).length, 1)
  strictEqual(listerArchive(cible).length, 0)
  strictEqual(listerFavoris(cible).favoris.length, 0)
  strictEqual(cible.isTransaction, false)
  deepStrictEqual(importerExport(cible, donnees), essai)
})

test('un fichier de version 1 reste lisible, les sections complètes invalides sont ignorées', () => {
  const v1 = lireExport(JSON.stringify({ format: 'arbalete-donnees', version: 1, favoris: {}, historique: [] })) // pregate-literal: VERSION_EXPORT=1 fichier de version 1, toujours lisible
  strictEqual(v1.profils, undefined)
  const lu = lireExport(
    JSON.stringify({
      format: 'arbalete-donnees',
      version: VERSION_EXPORT,
      profils: ['Pro', 'Pro', '', 7, 'x'.repeat(41)],
      permissions: [
        { profil: null, hote: 'ok.fr', permission: 'micro', choix: 'autoriser' },
        { profil: null, hote: 'Majuscule.fr', permission: 'micro', choix: 'autoriser' },
        { profil: null, hote: 'ok.fr', permission: 'hid', choix: 'autoriser' },
        { profil: null, hote: 'ok.fr', permission: 'micro', choix: 'demander' },
        { profil: '', hote: 'ok.fr', permission: 'micro', choix: 'refuser' },
        'x'
      ],
      archive: [
        { url: 'https://a.fr/', titre: 'A', date: 5 },
        { url: 'javascript:alert(1)', titre: 'J', date: 5 },
        { url: 'https://b.fr/', titre: 'B', date: 'hier' }
      ],
      onglets: [{ url: 'https://a.fr/', titre: 'A', espace: 'Perso' }, { url: 'data:text/html,x' }, 3]
    })
  )
  deepStrictEqual(lu.profils, ['Pro'])
  strictEqual(lu.permissions!.length, 1)
  strictEqual(lu.archive!.length, 1)
  deepStrictEqual(lu.onglets, [{ url: 'https://a.fr/', titre: 'A', espace: 'Perso' }])
})

test('une permission d’un profil absent du fichier est ignorée', () => {
  const cible = ouvrirBase(':memory:')
  const donnees = lireExport(
    JSON.stringify({
      format: 'arbalete-donnees',
      version: VERSION_EXPORT,
      permissions: [{ profil: 'Inconnu', hote: 'ok.fr', permission: 'micro', choix: 'autoriser' }]
    })
  )
  strictEqual(importerExport(cible, donnees).permissions, 0)
})

// Value: protects=l'essai d'import annule aussi quand il échoue, et les onglets ouverts gardent leur espace et la date de l'export; fails_when=le ROLLBACK de essaiEnTransaction saute sur erreur, ou l'espace/la date de l'archive sont perdus; why_new=les tests existants ne couvrent que enTransaction et les urls de l'archive; seam=none; no_claim=boîtes de fichier et IPC (manuels)
test('un essai qui échoue annule et propage l’erreur', () => {
  const db = ouvrirBase(':memory:')
  throws(
    () =>
      essaiEnTransaction(db, () => {
        db.prepare('INSERT INTO dossier_favori (nom) VALUES (?)').run('X')
        throw new Error('boum')
      }),
    /boum/
  )
  strictEqual(db.isTransaction, false)
  strictEqual(db.prepare('SELECT COUNT(*) AS n FROM dossier_favori').get()!.n, 0)
})

test('un onglet ouvert du fichier est archivé avec son espace et la date de l’export', () => {
  const { db } = remplirComplet()
  const cible = ouvrirBase(':memory:')
  importerExport(cible, lireExport(JSON.stringify(construireExport(db, 4242, true))))
  const ligne = cible.prepare('SELECT date, espace FROM archive WHERE url = ?').get('https://example.com/ouvert')!
  strictEqual(Number(ligne.date), 4242)
  strictEqual(Number(ligne.espace), lireEspaces(cible).find((e) => e.nom === 'Perso')!.id)
})

test('ecrireExport d’une sauvegarde complète rend les comptes relus', () => {
  const { db } = remplirComplet()
  const dossier = mkdtempSync(join(tmpdir(), 'arbalete-sauv-'))
  try {
    deepStrictEqual(ecrireExport(join(dossier, 's.json'), construireExport(db, 4242, true)), {
      favoris: 2,
      pages: 2,
      profils: 1,
      permissions: 3,
      archive: 2
    })
  } finally {
    rmSync(dossier, { recursive: true, force: true })
  }
})

test('l’archive importée n’efface jamais l’archive existante (place restante seulement)', () => {
  const cible = ouvrirBase(':memory:')
  archiver(
    cible,
    Array.from({ length: 199 }, (_, i) => ({ url: `https://local.test/${i}`, titre: 'L', espace: null })),
    1000
  )
  const donnees = lireExport(
    JSON.stringify({
      format: 'arbalete-donnees',
      version: VERSION_EXPORT,
      archive: ['a', 'b', 'c'].map((i, n) => ({ url: `https://fichier.test/${i}`, titre: 'F', date: 9000 + n }))
    })
  )
  strictEqual(importerExport(cible, donnees).archive, 1)
  strictEqual(listerArchive(cible).length, 200)
  strictEqual(listerArchive(cible).filter((a) => a.url.startsWith('https://local.test/')).length, 199)
})
