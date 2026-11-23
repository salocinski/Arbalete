import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  basculerPartage,
  dansPartage,
  ECART_PARTAGE,
  ecrirePartage,
  lirePartage,
  ratioBorne,
  scinder
} from './vuePartagee.ts'

test('les deux moitiés tiennent dans la zone, séparées par l’écart', () => {
  const zone = { x: 260, y: 48, width: 801, height: 500 }
  const { gauche, droite } = scinder(zone)
  assert.equal(gauche.x, 260)
  assert.equal(droite.x, gauche.x + gauche.width + ECART_PARTAGE)
  assert.equal(droite.x + droite.width, zone.x + zone.width)
  assert.equal(gauche.height, 500)
  assert.equal(droite.y, 48)
})

test('une zone plus étroite que l’écart ne donne jamais de largeur négative', () => {
  const { gauche, droite } = scinder({ x: 0, y: 0, width: 3, height: 10 })
  assert.equal(gauche.width, 0)
  assert.equal(droite.width, 0)
})

test('le menu place l’onglet visé à côté de l’actif, et l’onglet déjà partagé quitte la vue', () => {
  assert.deepEqual(basculerPartage(null, 'a', 'b'), { gauche: 'a', droite: 'b' })
  assert.equal(basculerPartage({ gauche: 'a', droite: 'b' }, 'a', 'b'), null)
  assert.equal(basculerPartage({ gauche: 'a', droite: 'b' }, 'b', 'a'), null)
  assert.deepEqual(basculerPartage({ gauche: 'a', droite: 'b' }, 'a', 'c'), { gauche: 'a', droite: 'c' })
})

test('l’onglet actif ne se partage pas avec lui-même ni sans onglet actif', () => {
  assert.equal(basculerPartage(null, 'a', 'a'), null)
  assert.equal(basculerPartage(null, null, 'a'), null)
  assert.equal(dansPartage({ gauche: 'a', droite: 'b' }, 'c'), false)
  assert.equal(dansPartage(null, 'a'), false)
})

test('le ratio règle la largeur de la page de gauche et reste borné', () => {
  const zone = { x: 0, y: 0, width: 1008, height: 10 }
  assert.equal(scinder(zone, 0.7).gauche.width, 700)
  assert.equal(scinder(zone, 0.01).gauche.width, 200)
  assert.equal(scinder(zone, 5).gauche.width, 800)
  assert.equal(ratioBorne(NaN), 0.5)
  assert.equal(ratioBorne('0.3'), 0.5)
})

test('la vue partagée s’écrit en indices et se relit, sans jamais croire un texte invalide', () => {
  const ids = ['a', 'b', 'c']
  const texte = ecrirePartage({ gauche: 'c', droite: 'a', ratio: 0.3 }, (id) => ids.indexOf(id))
  assert.deepEqual(lirePartage(texte, ids), { gauche: 'c', droite: 'a', ratio: 0.3 })
  assert.equal(
    ecrirePartage(null, (id) => ids.indexOf(id)),
    ''
  )
  assert.equal(
    ecrirePartage({ gauche: 'a', droite: 'z' }, (id) => ids.indexOf(id)),
    ''
  )
  for (const mauvais of [undefined, '', 'x', '{}', '{"g":0,"d":0}', '{"g":0,"d":9}', '{"g":"0","d":1}'])
    assert.equal(lirePartage(mauvais, ids), null)
})
