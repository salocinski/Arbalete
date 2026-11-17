import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { delaiArchivageValide, epinglesDabord, ongletsAArchiver, type OngletArchivable } from './archivage.ts'

const H = 3_600_000
const onglet = (id: string, reste: Partial<OngletArchivable> = {}): OngletArchivable => ({
  id,
  epingle: false,
  affiche: false,
  sonore: false,
  activite: 0,
  ...reste
})

describe('ongletsAArchiver', () => {
  it('archive un onglet laissé de côté au moins le délai, pas avant', () => {
    const onglets = [onglet('a', { activite: 100 * H }), onglet('b', { activite: 105 * H })]
    assert.deepEqual(ongletsAArchiver(onglets, 112 * H, 12), ['a'])
    assert.deepEqual(ongletsAArchiver(onglets, 112 * H - 1, 12), [])
  })
  it('garde les épinglés, l’onglet affiché et celui qui joue du son', () => {
    const onglets = [
      onglet('epingle', { epingle: true }),
      onglet('affiche', { affiche: true }),
      onglet('son', { sonore: true }),
      onglet('vieux')
    ]
    assert.deepEqual(ongletsAArchiver(onglets, 1000 * H, 12), ['vieux'])
  })
  it('« Jamais » et un délai inconnu n’archivent rien', () => {
    const onglets = [onglet('a')]
    assert.deepEqual(ongletsAArchiver(onglets, 1000 * H, 0), [])
    assert.deepEqual(ongletsAArchiver(onglets, 1000 * H, 5), [])
  })
})

describe('delaiArchivageValide', () => {
  it('n’accepte que la liste fermée', () => {
    for (const bon of [12, 24, 168, 720, 0]) assert.equal(delaiArchivageValide(bon), true)
    for (const mauvais of [1, -12, '12', null, undefined, NaN]) assert.equal(delaiArchivageValide(mauvais), false)
  })
})

describe('epinglesDabord', () => {
  it('place les épinglés en tête sans changer l’ordre de chaque groupe', () => {
    const ordre = epinglesDabord([
      { id: 1, epingle: false },
      { id: 2, epingle: true },
      { id: 3, epingle: false },
      { id: 4, epingle: true }
    ])
    assert.deepEqual(
      ordre.map((o) => o.id),
      [2, 4, 1, 3]
    )
  })
})
