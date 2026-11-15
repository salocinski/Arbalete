import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { LONGUEUR_MAX_NOM_DOSSIER_ONGLET } from '../../shared/dossiersOnglets.ts'
import { ouvrirBase } from './base.ts'
import { creerDossierOnglet, lireDossiersOnglets, renommerDossierOnglet, replierDossierOnglet, supprimerDossierOnglet } from './dossiersOnglets.ts'
import { creerEspace, supprimerEspace } from './espaces.ts'
import { MIGRATIONS, appliquerMigrations, versionDuSchema } from './migrations.ts'
import { lireSession, sauverSession } from './session.ts'

// Tests unitaires des dossiers d'onglets (ARB-69).

const espaceDe = (db: ReturnType<typeof ouvrirBase>) => creerEspace(db, { nom: 'Dev', couleur: 'development', icone: '◆' })

test('les dossiers se créent dans un espace et se relisent dans leur ordre, dépliés', () => {
  const db = ouvrirBase(':memory:')
  const espace = espaceDe(db)
  const a = creerDossierOnglet(db, espace, ' Lecture ')
  const b = creerDossierOnglet(db, espace, 'Travail')
  deepStrictEqual(lireDossiersOnglets(db), [{ id: a, nom: 'Lecture', espace, replie: false }, { id: b, nom: 'Travail', espace, replie: false }])
})

test('un nom vide ou trop long, ou un espace inconnu, est refusé', () => {
  const db = ouvrirBase(':memory:')
  const espace = espaceDe(db)
  throws(() => creerDossierOnglet(db, espace, '  '), /Nom de dossier invalide/)
  throws(() => creerDossierOnglet(db, espace, 'x'.repeat(LONGUEUR_MAX_NOM_DOSSIER_ONGLET + 1)), /Nom de dossier invalide/)
  throws(() => creerDossierOnglet(db, espace + 1, 'Ok'))
  const id = creerDossierOnglet(db, espace, 'Ok')
  throws(() => renommerDossierOnglet(db, id, ''), /Nom de dossier invalide/)
  deepStrictEqual(lireDossiersOnglets(db).map((d) => d.nom), ['Ok'])
})

test('renommer et replier changent le dossier, un id inconnu est ignoré', () => {
  const db = ouvrirBase(':memory:')
  const id = creerDossierOnglet(db, espaceDe(db), 'A')
  strictEqual(renommerDossierOnglet(db, id, 'B'), true)
  strictEqual(replierDossierOnglet(db, id, true), true)
  deepStrictEqual(lireDossiersOnglets(db).map(({ nom, replie }) => ({ nom, replie })), [{ nom: 'B', replie: true }])
  strictEqual(renommerDossierOnglet(db, id + 1, 'C'), false)
  strictEqual(replierDossierOnglet(db, id + 1, true), false)
})

test("l'appartenance d'un onglet à un dossier revient avec la session, et un dossier supprimé le remet à la racine", () => {
  const db = ouvrirBase(':memory:')
  const espace = espaceDe(db)
  const dossier = creerDossierOnglet(db, espace, 'A')
  sauverSession(db, [{ url: 'https://a.test/', titre: 'A', actif: true, espace, dossier }, { url: 'https://b.test/', titre: 'B', actif: false, espace }])
  deepStrictEqual(lireSession(db).map((o) => o.dossier), [dossier, undefined])
  strictEqual(supprimerDossierOnglet(db, dossier), true)
  deepStrictEqual(lireSession(db).map((o) => o.dossier), [undefined, undefined])
})

test('un dossier supprimé entre-temps ne fait pas échouer l’écriture de la session', () => {
  const db = ouvrirBase(':memory:')
  const espace = espaceDe(db)
  sauverSession(db, [{ url: 'https://a.test/', titre: 'A', actif: true, espace, dossier: 999 }])
  deepStrictEqual(lireSession(db).map((o) => o.dossier), [undefined])
})

test('supprimer un espace supprime ses dossiers et garde ceux des autres', () => {
  const db = ouvrirBase(':memory:')
  const a = espaceDe(db)
  const b = creerEspace(db, { nom: 'Perso', couleur: 'personal', icone: '✳' })
  creerDossierOnglet(db, a, 'Dans A')
  const gardé = creerDossierOnglet(db, b, 'Dans B')
  supprimerEspace(db, a)
  deepStrictEqual(lireDossiersOnglets(db).map((d) => d.id), [gardé])
})

test('une base au schéma 8 (avant ARB-69) gagne les dossiers sans perdre sa session', () => {
  const ancienne = new DatabaseSync(':memory:')
  appliquerMigrations(ancienne, MIGRATIONS.slice(0, 8))
  ancienne.exec("INSERT INTO onglet (position, url, titre, actif) VALUES (0, 'https://example.com/', 'Exemple', 1)")
  appliquerMigrations(ancienne)
  strictEqual(versionDuSchema(ancienne), MIGRATIONS.length)
  deepStrictEqual(lireSession(ancienne), [{ url: 'https://example.com/', titre: 'Exemple', actif: true }])
  deepStrictEqual(lireDossiersOnglets(ancienne), [])
})
