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
  deplacerFavori(db, Number(db.prepare('SELECT id FROM favori WHERE url = ?').get('https://example.com/b')!.id), dossier)
  ajouterVisite(db, 'https://example.com/a', 'A', 5000)
  ajouterVisite(db, 'https://example.com/a', 'A', 6000)
  ajouterVisite(db, 'https://example.org/', 'Org', 7000)
  creerEspace(db, { nom: 'Perso', couleur: 'personal', icone: '🏠' })
  ecrireTheme(db, 'dark')
  ecrireMoteur(db, { id: 'duckduckgo', modele: '' })
  ecrireReglages(db, { accueil: 'https://exemple.fr/', animationsReduites: true, dossierTelechargements: 'C:\\Perso', archivageHeures: 24, veilleMinutes: 60 })
  return db
}

test('export puis import dans une base vide : tout revient, sauf le dossier de téléchargement', () => {
  const source = remplir()
  const fichier = JSON.stringify(construireExport(source, 42))
  const cible = ouvrirBase(':memory:')
  const bilan = importerExport(cible, lireExport(fichier))
  deepStrictEqual(bilan, { favoris: 2, pages: 2, espaces: 1, reglages: true })
  const liste = listerFavoris(cible)
  deepStrictEqual(liste.dossiers.map((d) => d.nom), ['Travail'])
  deepStrictEqual(liste.favoris.map((f) => [f.url, f.titre, f.dossier === null ? null : liste.dossiers.find((d) => d.id === f.dossier)!.nom]),
    [['https://example.com/a', 'A', null], ['https://example.com/b', 'B', 'Travail']])
  strictEqual(lirePage(cible, 'https://example.com/a')!.visites, 2)
  strictEqual(lirePage(cible, 'https://example.com/a')!.derniereVisite, 6000)
  strictEqual(listerHistorique(cible, '').length, 2) // une ligne par page et par jour
  deepStrictEqual(lireEspaces(cible).map((e) => e.nom), ['Perso'])
  strictEqual(lireTheme(cible), 'dark')
  strictEqual(lireMoteur(cible).id, 'duckduckgo')
  deepStrictEqual(lireReglages(cible), { accueil: 'https://exemple.fr/', animationsReduites: true, dossierTelechargements: null, archivageHeures: 24, veilleMinutes: 60 })
})

test('rejouer un import ne change rien', () => {
  const donnees = lireExport(JSON.stringify(construireExport(remplir())))
  const cible = ouvrirBase(':memory:')
  importerExport(cible, donnees)
  const avant = JSON.stringify(construireExport(cible, 0))
  deepStrictEqual(importerExport(cible, donnees), { favoris: 0, pages: 0, espaces: 0, reglages: true })
  strictEqual(JSON.stringify(construireExport(cible, 0)), avant)
})

test('l’import ne supprime ni ne remplace : favori existant gardé, visites ajoutées', () => {
  const cible = ouvrirBase(':memory:')
  basculerFavori(cible, 'https://example.com/a', 'Mon titre', 9)
  ajouterVisite(cible, 'https://example.com/a', 'Mon titre', 100)
  basculerFavori(cible, 'https://autre.fr/', 'Autre', 10)
  importerExport(cible, lireExport(JSON.stringify(construireExport(remplir()))))
  deepStrictEqual({ ...cible.prepare('SELECT titre, date FROM favori WHERE url = ?').get('https://example.com/a') }, { titre: 'Mon titre', date: 9 })
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
  deepStrictEqual(lireEspaces(cible).map((e) => [e.nom, e.couleur]), [['Perso', 'work']])
})

test('un fichier étranger, illisible ou plus récent est refusé', () => {
  throws(() => lireExport('pas du json'), /illisible/)
  throws(() => lireExport('[]'), /pas un export/)
  throws(() => lireExport(JSON.stringify({ format: 'autre', version: 1 })), /pas un export/)
  throws(() => lireExport(JSON.stringify({ format: 'arbalete-donnees', version: VERSION_EXPORT + 1 })), /plus récente/)
  throws(() => lireExport(JSON.stringify({ format: 'arbalete-donnees', version: 'x' })), /Version/)
})

test('un dossier du même nom est réutilisé, pas dupliqué', () => {
  const cible = ouvrirBase(':memory:')
  creerDossier(cible, 'Travail')
  importerExport(cible, lireExport(JSON.stringify(construireExport(remplir()))))
  deepStrictEqual(listerFavoris(cible).dossiers.map((d) => d.nom), ['Travail'])
  strictEqual(listerFavoris(cible).favoris.filter((f) => f.dossier !== null).length, 1)
})

test('une version nulle ou non entière est refusée', () => {
  for (const version of [0, 1.5, -1]) throws(() => lireExport(JSON.stringify({ format: 'arbalete-donnees', version })), /Version/)
})

test('les entrées invalides sont ignorées, pas le reste', () => {
  const donnees = lireExport(JSON.stringify({
    format: 'arbalete-donnees', version: 1, exporteLe: 'hier',
    favoris: { dossiers: ['', 12, 'Ok'], favoris: [
      { url: 'javascript:alert(1)', titre: 'x' }, { url: 'file:///C:/a', titre: 'x' }, 7, null,
      { url: avecIdentifiants('https://example.com/p#frag'), titre: 'Bon', date: -5, dossier: 'Ok' } // identifiants et fragment retirés
    ] },
    historique: [{ url: 'data:text/html,x', dates: [1] }, { url: 'https://example.com/', dates: ['a', -1, 1.5, 3000] }, { url: 'https://vide.fr/', dates: [] }],
    espaces: [{ nom: 'Mauvaise', couleur: 'inconnue', icone: 'x' }, { nom: 'x'.repeat(41), couleur: 'work', icone: 'x' }, { nom: 'Bonne', couleur: 'work', icone: 'x' }],
    reglages: { theme: 'neon', moteur: { id: 'inconnu' }, accueil: 'ftp://x', animationsReduites: 'oui', archivageHeures: 5, veilleMinutes: 30 }
  }))
  strictEqual(donnees.exporteLe, 0)
  deepStrictEqual(donnees.favoris.dossiers, ['Ok'])
  deepStrictEqual(donnees.favoris.favoris.map((f) => [f.url, f.dossier]), [['https://example.com/p', 'Ok']])
  deepStrictEqual(donnees.historique, [{ url: 'https://example.com/', titre: '', dates: [3000] }])
  deepStrictEqual(donnees.espaces.map((e) => e.nom), ['Bonne'])
  deepStrictEqual(donnees.reglages, { veilleMinutes: 30 })
})

test('un BOM est toléré et une date future est ignorée', () => {
  const futur = Date.now() + 10 * 86_400_000
  const donnees = lireExport('﻿' + JSON.stringify({ format: 'arbalete-donnees', version: 1,
    historique: [{ url: 'https://example.com/', dates: [futur, 3000] }] }))
  deepStrictEqual(donnees.historique, [{ url: 'https://example.com/', titre: '', dates: [3000] }])
})

test('une visite à date future en base n’empêche pas l’export', () => {
  const db = ouvrirBase(':memory:')
  ajouterVisite(db, 'https://example.com/', 'A', 5000)
  ajouterVisite(db, 'https://futur.fr/', 'F', Date.now() + 30 * 86_400_000)
  const dossier = mkdtempSync(join(tmpdir(), 'arbalete-export-'))
  try { deepStrictEqual(ecrireExport(join(dossier, 'x.json'), construireExport(db)), { favoris: 0, pages: 1 }) } finally { rmSync(dossier, { recursive: true, force: true }) }
})

test('un import sans réglages ne touche pas aux réglages', () => {
  const cible = ouvrirBase(':memory:')
  ecrireTheme(cible, 'light')
  const donnees = lireExport(JSON.stringify({ format: 'arbalete-donnees', version: 1 }))
  deepStrictEqual(importerExport(cible, donnees), { favoris: 0, pages: 0, espaces: 0, reglages: false })
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
    deepStrictEqual(ecrireExport(chemin, donnees), { favoris: 2, pages: 2 })
    deepStrictEqual(readdirSync(dossier), ['sauvegarde.json'])
    strictEqual(lireExport(readFileSync(chemin, 'utf8')).favoris.favoris.length, 2)

    writeFileSync(chemin, 'ancien')
    // Un favori hors du web ne survit pas à la relecture : l'export est refusé avant le renommage.
    const incomplet = { ...donnees, favoris: { ...donnees.favoris, favoris: [...donnees.favoris.favoris, { url: 'about:blank', titre: '', date: 1, dossier: null }] } }
    throws(() => ecrireExport(chemin, incomplet), /incomplet/)
    strictEqual(readFileSync(chemin, 'utf8'), 'ancien')
    deepStrictEqual(readdirSync(dossier), ['sauvegarde.json'])
    await rejects(Promise.resolve().then(() => ecrireExport(join(dossier, 'absent', 'x.json'), donnees)))
  } finally { rmSync(dossier, { recursive: true, force: true }) }
})
