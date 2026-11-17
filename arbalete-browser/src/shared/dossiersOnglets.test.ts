import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { test } from 'node:test'
import {
  LONGUEUR_MAX_NOM_DOSSIER_ONGLET,
  dossierAccepte,
  nomDossierOngletValide,
  sectionsParDossier,
  type DossierOnglet
} from './dossiersOnglets.ts'

// Tests unitaires des dossiers d'onglets partagés (ARB-69).

const ouvert: DossierOnglet = { id: 1, nom: 'Lecture', replie: false }
const ferme: DossierOnglet = { id: 2, nom: 'Travail', replie: true }
const tab = (id: string, folder?: number) => ({ id, ...(folder === undefined ? {} : { folder }) })
const ids = (sections: ReturnType<typeof sectionsParDossier>) =>
  sections.map((s) => [s.dossier?.id ?? null, s.onglets.map((o) => o.id)])

test('le nom est nettoyé, vide ou trop long refusé', () => {
  strictEqual(nomDossierOngletValide('  Lecture '), 'Lecture')
  strictEqual(nomDossierOngletValide('   '), null)
  strictEqual(nomDossierOngletValide(42), null)
  strictEqual(nomDossierOngletValide('x'.repeat(LONGUEUR_MAX_NOM_DOSSIER_ONGLET)) !== null, true)
  strictEqual(nomDossierOngletValide('x'.repeat(LONGUEUR_MAX_NOM_DOSSIER_ONGLET + 1)), null)
})

test('les sections listent chaque dossier avec ses onglets, puis les onglets à la racine, dans l’ordre reçu', () => {
  const onglets = [tab('a'), tab('b', 1), tab('c'), tab('d', 1)]
  deepStrictEqual(ids(sectionsParDossier(onglets, [ouvert, ferme], null)), [
    [1, ['b', 'd']],
    [2, []],
    [null, ['a', 'c']]
  ])
})

test('un dossier replié ne montre que l’onglet actif', () => {
  const onglets = [tab('a', 2), tab('b', 2), tab('c')]
  deepStrictEqual(ids(sectionsParDossier(onglets, [ferme], 'b')), [
    [2, ['b']],
    [null, ['c']]
  ])
})

test('un onglet dont le dossier est inconnu est rangé à la racine', () => {
  deepStrictEqual(ids(sectionsParDossier([tab('a', 9)], [ouvert], null)), [
    [1, []],
    [null, ['a']]
  ])
})

test('un onglet entre dans un dossier de son espace seulement, et jamais épinglé', () => {
  const dossiers = [{ id: 1, espace: 10 }]
  strictEqual(dossierAccepte(dossiers, 1, 10, false), true)
  strictEqual(dossierAccepte(dossiers, 1, 11, false), false)
  strictEqual(dossierAccepte(dossiers, 1, null, false), false)
  strictEqual(dossierAccepte(dossiers, 1, 10, true), false)
  strictEqual(dossierAccepte(dossiers, 2, 10, false), false)
  strictEqual(dossierAccepte(dossiers, undefined, 10, false), false)
})
