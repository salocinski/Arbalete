import { strictEqual, throws } from 'node:assert/strict'
import { test } from 'node:test'
import { hoteTelechargementAutorise, idExtensionStore, urlTelechargementStore, versionPlusRecente } from './webStore.ts'

const ID = 'eimadpbcbfnmbkopoojfekhnkhdbieeh' // Dark Reader

test('idExtensionStore lit un identifiant ou un lien de fiche, rien d’autre', () => {
  strictEqual(idExtensionStore(ID), ID)
  strictEqual(idExtensionStore(`  ${ID}  `), ID)
  strictEqual(idExtensionStore(`https://chromewebstore.google.com/detail/dark-reader/${ID}?hl=fr`), ID)
  strictEqual(idExtensionStore(`https://chrome.google.com/webstore/detail/dark-reader/${ID}`), ID)
  strictEqual(idExtensionStore(`https://chromewebstore.google.com/detail/${ID}`), ID)
  for (const mauvais of [
    '',
    'abc',
    ID.toUpperCase(),
    ID + 'a',
    'q'.repeat(32), // hors de a à p
    `http://chromewebstore.google.com/detail/x/${ID}`,
    `https://exemple.org/detail/x/${ID}`,
    `https://chromewebstore.google.com/search/${ID}`
  ])
    strictEqual(idExtensionStore(mauvais), null, mauvais)
})

test('urlTelechargementStore refuse un identifiant ou une version aberrants', () => {
  strictEqual(
    urlTelechargementStore(ID, '156.0.8078.80'),
    `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=156.0.8078.80&acceptformat=crx3&x=id%3D${ID}%26uc`
  )
  throws(() => urlTelechargementStore('x', '1.0'))
  throws(() => urlTelechargementStore(ID, '1.0&x=2'))
})

test('hôtes de téléchargement admis et versions comparées par nombres', () => {
  strictEqual(hoteTelechargementAutorise('clients2.google.com'), true)
  strictEqual(hoteTelechargementAutorise('clients2.googleusercontent.com'), true)
  strictEqual(hoteTelechargementAutorise('edgedl.me.gvt1.com'), true)
  for (const h of ['google.com', 'evil.com', 'clients2.google.com.evil.com', 'gvt1.com.evil.org'])
    strictEqual(hoteTelechargementAutorise(h), false, h)
  strictEqual(versionPlusRecente('4.10.0', '4.9.1'), true)
  strictEqual(versionPlusRecente('1.0', '1.0.0'), false)
  strictEqual(versionPlusRecente('1.0.1', '1.0'), true)
  strictEqual(versionPlusRecente('2', '10'), false)
})
