import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict'
import { test } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { ouvrirBase } from './base.ts'
import { MIGRATIONS, appliquerMigrations, versionDuSchema } from './migrations.ts'
import { creerProfil, supprimerProfil } from './profils.ts'
import {
  ajouterExtension,
  definirExtensionActive,
  dossierExtension,
  dossiersDuProfil,
  listerExtensions,
  supprimerExtension
} from './extensions.ts'

// Tests unitaires du dépôt des extensions Chrome (ARB-144).

const exemple = {
  profil: 1,
  nom: 'Dark Reader',
  version: '4.9.135',
  permissions: ['storage', '<all_urls>'],
  dossier: 'a1-b2'
}

test('une extension ajoutée est inactive, se liste par profil, s’active et se supprime en rendant son dossier', () => {
  const db = ouvrirBase(':memory:')
  const id = ajouterExtension(db, exemple)
  deepStrictEqual(listerExtensions(db, 1), [
    { id, profil: 1, nom: 'Dark Reader', version: '4.9.135', permissions: ['storage', '<all_urls>'], actif: false }
  ])
  strictEqual(definirExtensionActive(db, id, true), true)
  strictEqual(listerExtensions(db, 1)[0].actif, true)
  strictEqual(definirExtensionActive(db, 99, true), false)
  strictEqual(dossierExtension(db, id), 'a1-b2')
  deepStrictEqual(supprimerExtension(db, id), { dossier: 'a1-b2' })
  strictEqual(supprimerExtension(db, id), null)
  deepStrictEqual(listerExtensions(db, 1), [])
})

test('un dossier qui n’est pas un nom généré est refusé, un dossier ne sert qu’une fois', () => {
  const db = ouvrirBase(':memory:')
  for (const dossier of ['', '..', 'a/b', 'C:\\x', 'A']) throws(() => ajouterExtension(db, { ...exemple, dossier }))
  ajouterExtension(db, exemple)
  throws(() => ajouterExtension(db, exemple))
  throws(() => listerExtensions(db, 1.5))
})

test('les extensions d’un profil restent dans ce profil, et supprimer le profil supprime ses lignes', () => {
  const db = ouvrirBase(':memory:')
  const travail = creerProfil(db, 'Travail')
  ajouterExtension(db, exemple)
  const b = ajouterExtension(db, { ...exemple, profil: travail, dossier: 'c3-d4' })
  strictEqual(listerExtensions(db, 1).length, 1)
  deepStrictEqual(dossiersDuProfil(db, travail), ['c3-d4'])
  strictEqual(listerExtensions(db, travail)[0].id, b)
  supprimerProfil(db, travail)
  deepStrictEqual(listerExtensions(db, travail), [])
  strictEqual(listerExtensions(db, 1).length, 1)
})

test('une colonne de permissions illisible s’affiche sans permissions', () => {
  const db = ouvrirBase(':memory:')
  const id = ajouterExtension(db, exemple)
  db.prepare('UPDATE extension SET permissions = ? WHERE id = ?').run('{pas du json', id)
  deepStrictEqual(listerExtensions(db, 1)[0].permissions, [])
  db.prepare('UPDATE extension SET permissions = ? WHERE id = ?').run('[1,"tabs"]', id)
  deepStrictEqual(listerExtensions(db, 1)[0].permissions, ['tabs'])
})

test('la migration 12 s’applique à une base du schéma 11 sans toucher aux profils', () => {
  const ancienne = new DatabaseSync(':memory:')
  ancienne.exec('PRAGMA foreign_keys = ON')
  appliquerMigrations(ancienne, MIGRATIONS.slice(0, 11))
  strictEqual(versionDuSchema(ancienne), 11)
  ancienne.exec("INSERT INTO profil (nom, partition, position) VALUES ('Travail', 'persist:profil-2', 1)")
  appliquerMigrations(ancienne)
  strictEqual(versionDuSchema(ancienne), MIGRATIONS.length)
  deepStrictEqual(listerExtensions(ancienne, 2), [])
  strictEqual((ancienne.prepare('SELECT COUNT(*) AS n FROM profil').get() as { n: number }).n, 2)
})
