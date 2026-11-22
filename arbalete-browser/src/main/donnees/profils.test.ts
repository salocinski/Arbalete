import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict'
import { test } from 'node:test'
import { LONGUEUR_MAX_NOM_PROFIL, hotePourProfil, nomPartitionProfil, nomProfilValide } from '../../shared/profils.ts'
import { ouvrirBase } from './base.ts'
import { creerEspace, lireEspaces } from './espaces.ts'
import { creerProfil, definirProfilEspace, lireProfils, renommerProfil, supprimerProfil } from './profils.ts'

// Tests unitaires des profils de navigation (ARB-143).

test('le profil principal existe d’emblée, sans partition propre', () => {
  deepStrictEqual(lireProfils(ouvrirBase(':memory:')), [{ id: 1, nom: 'Principal', partition: null }])
})

test('un profil créé a sa partition persistante, se renomme, et les noms invalides sont refusés', () => {
  const db = ouvrirBase(':memory:')
  const id = creerProfil(db, '  Travail ')
  deepStrictEqual(lireProfils(db)[1], { id, nom: 'Travail', partition: nomPartitionProfil(id) })
  strictEqual(renommerProfil(db, id, 'Banque'), true)
  strictEqual(renommerProfil(db, 99, 'X'), false)
  throws(() => creerProfil(db, '   '))
  throws(() => creerProfil(db, 'x'.repeat(LONGUEUR_MAX_NOM_PROFIL + 1)))
  strictEqual(nomProfilValide(42), undefined)
})

test('le principal ne se supprime pas, ni un profil qui a des espaces', () => {
  const db = ouvrirBase(':memory:')
  const profil = creerProfil(db, 'Travail')
  const espace = creerEspace(db, { nom: 'E', couleur: 'personal', icone: '◆' })
  strictEqual(definirProfilEspace(db, espace, profil), true)
  strictEqual(lireEspaces(db)[0].profil, profil)
  throws(() => supprimerProfil(db, 1))
  throws(() => supprimerProfil(db, profil))
  strictEqual(definirProfilEspace(db, espace, 1), true)
  deepStrictEqual(supprimerProfil(db, profil), { partition: nomPartitionProfil(profil) })
  strictEqual(supprimerProfil(db, profil), null)
})

test('l’id d’un profil supprimé n’est jamais réutilisé (sa partition ne revient pas à un nouveau profil)', () => {
  const db = ouvrirBase(':memory:')
  const a = creerProfil(db, 'A')
  supprimerProfil(db, a)
  strictEqual(creerProfil(db, 'B') > a, true)
})

test('rattacher à un profil ou un espace inconnu est sans effet', () => {
  const db = ouvrirBase(':memory:')
  const espace = creerEspace(db, { nom: 'E', couleur: 'personal', icone: '◆' })
  strictEqual(definirProfilEspace(db, espace, 99), false)
  strictEqual(definirProfilEspace(db, 99, 1), false)
})

test('les clés par hôte du profil principal restent celles d’avant, les autres sont préfixées sans collision possible', () => {
  strictEqual(hotePourProfil('exemple.fr', 1), 'exemple.fr')
  strictEqual(hotePourProfil('exemple.fr', 2), '2@exemple.fr')
})
