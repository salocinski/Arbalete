import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { test } from 'node:test'
import { ouvrirBase } from './base.ts'
import { ecrirePreference } from './preferences.ts'
import {
  definirPermissionSite,
  ecrirePermissionSite,
  lirePermissionSite,
  listerPermissionsSites,
  reinitialiserSite
} from './permissionsSites.ts'

// Tests unitaires des permissions mémorisées par site (ARB-15).

test('sans choix enregistré, rien n’est lu', () => {
  strictEqual(lirePermissionSite(ouvrirBase(':memory:'), 'exemple.fr', 'micro'), undefined)
})

test('le choix est relu par site et par permission, sans déborder', () => {
  const db = ouvrirBase(':memory:')
  ecrirePermissionSite(db, 'exemple.fr', 'micro', 'autoriser')
  ecrirePermissionSite(db, 'exemple.fr', 'camera', 'refuser')
  strictEqual(lirePermissionSite(db, 'exemple.fr', 'micro'), 'autoriser')
  strictEqual(lirePermissionSite(db, 'exemple.fr', 'camera'), 'refuser')
  strictEqual(lirePermissionSite(db, 'autre.fr', 'micro'), undefined)
  ecrirePermissionSite(db, 'exemple.fr', 'micro', 'refuser')
  strictEqual(lirePermissionSite(db, 'exemple.fr', 'micro'), 'refuser')
})

test('une valeur aberrante en base est ignorée', () => {
  const db = ouvrirBase(':memory:')
  ecrirePreference(db, 'permission.exemple.fr.micro', 'peut-etre')
  strictEqual(lirePermissionSite(db, 'exemple.fr', 'micro'), undefined)
})

// ARB-145 : panneau de gestion par site.
test('le panneau liste les sites du profil, triés, sans ceux des autres profils', () => {
  const db = ouvrirBase(':memory:')
  ecrirePermissionSite(db, 'b.fr', 'micro', 'autoriser')
  ecrirePermissionSite(db, 'a.fr', 'camera', 'refuser')
  ecrirePermissionSite(db, 'a.fr', 'presse-papiers', 'autoriser')
  ecrirePermissionSite(db, '2@c.fr', 'micro', 'autoriser')
  deepStrictEqual(listerPermissionsSites(db, 1), [
    { hote: 'a.fr', choix: { camera: 'refuser', 'presse-papiers': 'autoriser' } },
    { hote: 'b.fr', choix: { micro: 'autoriser' } }
  ])
  deepStrictEqual(listerPermissionsSites(db, 2), [{ hote: 'c.fr', choix: { micro: 'autoriser' } }])
  deepStrictEqual(listerPermissionsSites(db, 3), [])
})

test('une clé ou une valeur aberrante n’apparaît pas dans le panneau', () => {
  const db = ouvrirBase(':memory:')
  ecrirePreference(db, 'permission.a.fr.hid', 'autoriser')
  ecrirePreference(db, 'permission.a.fr.micro', 'peut-etre')
  ecrirePreference(db, 'permission.micro', 'autoriser')
  deepStrictEqual(listerPermissionsSites(db, 1), [])
})

test('demander efface le choix, autoriser et refuser l’écrivent', () => {
  const db = ouvrirBase(':memory:')
  definirPermissionSite(db, 'a.fr', 'micro', 'refuser')
  strictEqual(lirePermissionSite(db, 'a.fr', 'micro'), 'refuser')
  definirPermissionSite(db, 'a.fr', 'micro', 'autoriser')
  strictEqual(lirePermissionSite(db, 'a.fr', 'micro'), 'autoriser')
  definirPermissionSite(db, 'a.fr', 'micro', 'demander')
  strictEqual(lirePermissionSite(db, 'a.fr', 'micro'), undefined)
})

test('réinitialiser un site garde son sous-domaine et les autres profils', () => {
  const db = ouvrirBase(':memory:')
  for (const hote of ['a.fr', 'a.fr.autre', '2@a.fr']) ecrirePermissionSite(db, hote, 'camera', 'refuser')
  ecrirePermissionSite(db, 'a.fr', 'micro', 'autoriser')
  reinitialiserSite(db, 'a.fr')
  strictEqual(lirePermissionSite(db, 'a.fr', 'camera'), undefined)
  strictEqual(lirePermissionSite(db, 'a.fr', 'micro'), undefined)
  strictEqual(lirePermissionSite(db, 'a.fr.autre', 'camera'), 'refuser')
  strictEqual(lirePermissionSite(db, '2@a.fr', 'camera'), 'refuser')
})
