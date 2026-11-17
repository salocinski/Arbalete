import { DatabaseSync } from 'node:sqlite'
import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { test } from 'node:test'
import { ARCHIVE_GARDEE_MAX } from '../../shared/archivage.ts'
import { archiver, listerArchive, retirerDeLArchive } from './archive.ts'
import { ouvrirBase } from './base.ts'
import { creerEspace } from './espaces.ts'
import { MIGRATIONS, appliquerMigrations } from './migrations.ts'
import { ecrireReglages, lirePreference, lireReglages } from './preferences.ts'
import { lireSession, sauverSession } from './session.ts'

// Tests unitaires de l'archive et de l'épinglage persistant (ARB-64).

test('l’archive rend les plus récents d’abord et un élément ne se rouvre qu’une fois', () => {
  const db = ouvrirBase(':memory:')
  archiver(db, [{ url: 'https://a.test/', titre: 'A', espace: null }], 1000)
  archiver(
    db,
    [
      { url: 'https://b.test/', titre: 'B', espace: null },
      { url: 'https://c.test/', titre: 'C', espace: null }
    ],
    2000
  )
  deepStrictEqual(
    listerArchive(db).map((e) => e.titre),
    ['C', 'B', 'A']
  )
  const b = listerArchive(db)[1]
  deepStrictEqual(retirerDeLArchive(db, b.id), { id: b.id, url: 'https://b.test/', titre: 'B', date: 2000 })
  strictEqual(retirerDeLArchive(db, b.id), undefined)
  strictEqual(listerArchive(db).length, 2)
})

test('l’archive oublie les plus anciens au-delà de sa limite', () => {
  const db = ouvrirBase(':memory:')
  for (let i = 0; i < ARCHIVE_GARDEE_MAX + 5; i++)
    archiver(db, [{ url: `https://x.test/${i}`, titre: `${i}`, espace: null }], 1000 + i)
  const liste = listerArchive(db)
  strictEqual(liste.length, ARCHIVE_GARDEE_MAX)
  strictEqual(liste[0].titre, String(ARCHIVE_GARDEE_MAX + 4))
  strictEqual(liste[liste.length - 1].titre, '5')
})

test('un espace périmé est rangé comme « aucun espace » au lieu de faire échouer l’archivage', () => {
  const db = ouvrirBase(':memory:')
  const idEspace = creerEspace(db, { nom: 'Personnel', couleur: 'personal', icone: '✳' })
  archiver(
    db,
    [
      { url: 'https://a.test/', titre: 'A', espace: idEspace },
      { url: 'https://b.test/', titre: 'B', espace: 9999 }
    ],
    1
  )
  deepStrictEqual(
    db
      .prepare('SELECT espace FROM archive ORDER BY id')
      .all()
      .map((l) => l.espace),
    [idEspace, null]
  )
})

test('l’épinglage et le dernier usage reviennent avec la session', () => {
  const db = ouvrirBase(':memory:')
  sauverSession(db, [
    { url: 'https://a.test/', titre: 'A', actif: false, epingle: true, activite: 5000 },
    { url: 'https://b.test/', titre: 'B', actif: true }
  ])
  deepStrictEqual(lireSession(db), [
    { url: 'https://a.test/', titre: 'A', actif: false, epingle: true, activite: 5000 },
    { url: 'https://b.test/', titre: 'B', actif: true }
  ])
})

test('une base au schéma 7 passe au 8 sans perdre sa session', () => {
  const db = new DatabaseSync(':memory:')
  appliquerMigrations(db, MIGRATIONS.slice(0, 7))
  db.exec(`INSERT INTO onglet (position, url, titre, actif) VALUES (0, 'https://a.test/', 'A', 1)`)
  appliquerMigrations(db)
  deepStrictEqual(lireSession(db), [{ url: 'https://a.test/', titre: 'A', actif: true }])
  strictEqual(listerArchive(db).length, 0)
})

test('le délai d’archivage se relit, et une valeur inconnue redonne 12 heures', () => {
  const db = ouvrirBase(':memory:')
  strictEqual(lireReglages(db).archivageHeures, 12)
  ecrireReglages(db, { ...lireReglages(db), archivageHeures: 168 })
  strictEqual(lireReglages(db).archivageHeures, 168)
  db.prepare(`UPDATE etat SET valeur = '7' WHERE cle = 'pref.archivage.heures'`).run()
  strictEqual(lireReglages(db).archivageHeures, 12)
  strictEqual(lirePreference(db, 'archivage.heures'), '7')
})
