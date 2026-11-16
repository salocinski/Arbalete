import { deepEqual, strictEqual } from 'node:assert/strict'
import { test } from 'node:test'
import { ouvrirBase } from './base.ts'
import { ecrireBarre, ecrireMoteur, ecrirePreference, ecrireReglages, ecrireTheme, lireBarre, lireMoteur, lirePreference, lireReglages, lireTheme } from './preferences.ts'
import { noterFermetureNormale, noterOuverture } from './fermeture.ts'

// Tests unitaires des préférences (ARB-59).

test('sans choix enregistré, le thème est « system »', () => {
  strictEqual(lireTheme(ouvrirBase(':memory:')), 'system')
})

test('le thème choisi est relu, et le dernier choix l’emporte', () => {
  const db = ouvrirBase(':memory:')
  ecrireTheme(db, 'dark')
  strictEqual(lireTheme(db), 'dark')
  ecrireTheme(db, 'light')
  strictEqual(lireTheme(db), 'light')
  ecrireTheme(db, 'system')
  strictEqual(lireTheme(db), 'system')
})

test('une valeur inconnue en base donne « system »', () => {
  const db = ouvrirBase(':memory:')
  for (const valeur of ['', 'sepia', 'DARK', '{"theme":"dark"}']) {
    ecrirePreference(db, 'theme', valeur)
    strictEqual(lireTheme(db), 'system', valeur)
  }
})

test('sans choix enregistré, la barre est masquée, étendue à 252 px', () => {
  deepEqual(lireBarre(ouvrirBase(':memory:')), { open: false, pinned: false, compact: false, width: 252 })
})

test('mode et largeur de la barre sont relus ; épinglée, elle démarre ouverte', () => {
  const db = ouvrirBase(':memory:')
  ecrireBarre(db, { open: true, pinned: true, compact: true, width: 320 })
  deepEqual(lireBarre(db), { open: true, pinned: true, compact: true, width: 320 })
  ecrireBarre(db, { open: false, pinned: false, compact: true, width: 252 })
  deepEqual(lireBarre(db), { open: false, pinned: false, compact: true, width: 252 })
})

test('une largeur illisible en base est bornée ou remplacée par 252', () => {
  const db = ouvrirBase(':memory:')
  for (const [valeur, attendu] of [['10', 200], ['9999', 400], ['large', 252], ['', 200]] as const) {
    ecrirePreference(db, 'barre.largeur', valeur)
    strictEqual(lireBarre(db).width, attendu, valeur)
  }
})

test('les préférences ne se mêlent pas aux notes de l’état de l’application', () => {
  const db = ouvrirBase(':memory:')
  ecrirePreference(db, 'theme', 'dark')
  strictEqual(noterOuverture(db), false)
  noterFermetureNormale(db)
  strictEqual(lirePreference(db, 'theme'), 'dark')
  strictEqual(lirePreference(db, 'inconnue'), undefined)
})

test('moteur de recherche (ARB-58) : Google par défaut, choix relu, valeur invalide redonne Google', () => {
  const db = ouvrirBase(':memory:')
  deepEqual(lireMoteur(db), { id: 'google', modele: '' })
  ecrireMoteur(db, { id: 'qwant', modele: '' })
  deepEqual(lireMoteur(db), { id: 'qwant', modele: '' })
  ecrireMoteur(db, { id: 'perso', modele: 'https://x.org/?q=%s' })
  deepEqual(lireMoteur(db), { id: 'perso', modele: 'https://x.org/?q=%s' })
  ecrireMoteur(db, { id: 'perso', modele: 'http://x.org/' })
  deepEqual(lireMoteur(db), { id: 'google', modele: '' })
  ecrirePreference(db, 'moteur', 'yahoo')
  deepEqual(lireMoteur(db), { id: 'google', modele: '' })
})

test('réglages (ARB-57) : valeurs par défaut, dernier choix relu, valeurs invalides ignorées', () => {
  const db = ouvrirBase(':memory:')
  deepEqual(lireReglages(db), { accueil: 'https://www.google.com', animationsReduites: false, dossierTelechargements: null, archivageHeures: 12, veilleMinutes: 30 })
  const choisis = { accueil: 'https://exemple.org/', animationsReduites: true, dossierTelechargements: 'C:/Telechargements', archivageHeures: 24, veilleMinutes: 60 }
  ecrireReglages(db, choisis)
  deepEqual(lireReglages(db), choisis)
  ecrireReglages(db, { ...choisis, dossierTelechargements: null })
  strictEqual(lireReglages(db).dossierTelechargements, null)
  ecrirePreference(db, 'accueil', 'javascript:alert(1)')
  ecrirePreference(db, 'telechargements.dossier', 'dossier/relatif')
  const relus = lireReglages(db)
  strictEqual(relus.accueil, 'https://www.google.com')
  strictEqual(relus.dossierTelechargements, null)
  ecrirePreference(db, 'veille.minutes', '31')
  strictEqual(lireReglages(db).veilleMinutes, 30)
})
