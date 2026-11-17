import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { delaiVeilleValide, memoireDesOnglets, ongletsAEndormir, type OngletEndormissable } from './veille.ts'

const MIN = 60_000
const onglet = (id: string, reste: Partial<OngletEndormissable> = {}): OngletEndormissable => ({
  id,
  affiche: false,
  sonore: false,
  enVeille: false,
  activite: 0,
  ...reste
})

describe('ongletsAEndormir', () => {
  it('endort un onglet laissé de côté au moins le délai, pas avant', () => {
    const onglets = [onglet('a', { activite: 100 * MIN }), onglet('b', { activite: 120 * MIN })]
    assert.deepEqual(ongletsAEndormir(onglets, 130 * MIN, 30), ['a'])
    assert.deepEqual(ongletsAEndormir(onglets, 130 * MIN - 1, 30), [])
  })
  it('garde l’onglet affiché, celui qui joue du son et ceux déjà en veille', () => {
    const onglets = [
      onglet('affiche', { affiche: true }),
      onglet('son', { sonore: true }),
      onglet('veille', { enVeille: true }),
      onglet('vieux')
    ]
    assert.deepEqual(ongletsAEndormir(onglets, 1000 * MIN, 30), ['vieux'])
  })
  it('endort aussi un onglet épinglé', () => {
    assert.deepEqual(ongletsAEndormir([onglet('p')], 1000 * MIN, 30), ['p'])
  })
  it('« Jamais » et un délai inconnu n’endorment rien', () => {
    assert.deepEqual(ongletsAEndormir([onglet('a')], 1000 * MIN, 0), [])
    assert.deepEqual(ongletsAEndormir([onglet('a')], 1000 * MIN, 7), [])
  })
})

describe('delaiVeilleValide', () => {
  it('n’accepte que les délais de la liste', () => {
    assert.equal(delaiVeilleValide(30), true)
    assert.equal(delaiVeilleValide(0), true)
    assert.equal(delaiVeilleValide(31), false)
    assert.equal(delaiVeilleValide('30'), false)
  })
})

describe('memoireDesOnglets', () => {
  const metriques = [
    { pid: 1, ko: 51_200 },
    { pid: 2, ko: 102_400 },
    { pid: 3, ko: 999_999 }
  ]
  it('additionne les processus des onglets en Mo, sans compter deux fois un processus partagé', () => {
    assert.equal(memoireDesOnglets([1, 2, 2], metriques), 150)
  })
  it('ignore les processus qui ne sont pas des onglets et un pid inconnu', () => {
    assert.equal(memoireDesOnglets([9], metriques), 0)
    assert.equal(memoireDesOnglets([], metriques), 0)
  })
})
