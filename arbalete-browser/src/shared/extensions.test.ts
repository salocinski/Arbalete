import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { test } from 'node:test'
import {
  LONGUEUR_MAX_NOM_EXTENSION,
  PERMISSIONS_MAX,
  dossierExtensionValide,
  libellePermission,
  validerManifest,
  cibleNomLocalise,
  messageLocalise
} from './extensions.ts'

// Tests unitaires des extensions Chrome (ARB-144).

const base = { manifest_version: 3, name: ' Dark Reader ', version: '4.9.135' }

test('un manifest V3 valide donne nom, version et permissions sans doublon (permissions et hôtes réunis)', () => {
  deepStrictEqual(
    validerManifest({ ...base, permissions: ['storage', 'tabs', 'storage'], host_permissions: ['<all_urls>'] }),
    { nom: 'Dark Reader', version: '4.9.135', permissions: ['storage', 'tabs', '<all_urls>'] }
  )
  deepStrictEqual(validerManifest(base), { nom: 'Dark Reader', version: '4.9.135', permissions: [] })
})

test('un manifest hostile ou invalide est refusé avec une erreur', () => {
  for (const mauvais of [
    null,
    [],
    'x',
    { ...base, manifest_version: 2 },
    { ...base, name: '   ' },
    { ...base, name: 'x'.repeat(LONGUEUR_MAX_NOM_EXTENSION + 1) },
    { ...base, name: 42 },
    { ...base, version: '1.2.3.4.5' },
    { ...base, version: '1.0-beta' },
    { ...base, permissions: 'tabs' },
    { ...base, permissions: Array.from({ length: PERMISSIONS_MAX + 1 }, (_, i) => 'p' + i) }
  ]) {
    strictEqual('erreur' in validerManifest(mauvais), true, JSON.stringify(mauvais)?.slice(0, 60))
  }
})

test('une permission invalide refuse le manifest : l’ignorer cacherait un accès à l’utilisateur', () => {
  for (const p of [7, '', 'x'.repeat(101), null]) {
    deepStrictEqual(validerManifest({ ...base, permissions: ['tabs', p] }), { erreur: 'Permission invalide' })
  }
})

test('les adresses des scripts de contenu comptent parmi les accès montrés', () => {
  deepStrictEqual(
    validerManifest({
      ...base,
      permissions: ['tabs'],
      content_scripts: [{ matches: ['<all_urls>', 'https://a.fr/*'] }, {}]
    }),
    { nom: 'Dark Reader', version: '4.9.135', permissions: ['tabs', '<all_urls>', 'https://a.fr/*'] }
  )
  deepStrictEqual(validerManifest({ ...base, content_scripts: [{ matches: [3] }] }), { erreur: 'Permission invalide' })
})

test('les libellés de permission : connue, hôte, autre, et noms hérités d’Object ne passent pas pour connus', () => {
  strictEqual(libellePermission('storage'), 'Enregistrer ses propres données')
  strictEqual(libellePermission('<all_urls>'), 'Lire et modifier vos données sur tous les sites')
  strictEqual(libellePermission('https://*.exemple.fr/*'), 'Lire et modifier vos données sur https://*.exemple.fr/*')
  strictEqual(libellePermission('sidePanel'), 'Autre permission : sidePanel')
  strictEqual(libellePermission('constructor'), 'Autre permission : constructor')
})

test('le nom du dossier de copie n’admet ni chemin ni point', () => {
  strictEqual(dossierExtensionValide('3f2a-9c'), true)
  for (const mauvais of ['', '..', 'a/b', 'a\\b', 'A', 'a.b', 'x'.repeat(65), 7, null]) {
    strictEqual(dossierExtensionValide(mauvais), false)
  }
})

test('un nom « __MSG_cle__ » se résout par la langue par défaut et la clé, sans tenir compte de la casse (ARB-161)', () => {
  deepStrictEqual(cibleNomLocalise({ name: '__MSG_extName__', default_locale: 'fr' }), { langue: 'fr', cle: 'extName' })
  deepStrictEqual(cibleNomLocalise({ name: ' __MSG_a@b__ ', default_locale: 'pt_BR' }), { langue: 'pt_BR', cle: 'a@b' })
  for (const mauvais of [
    { name: 'Dark Reader', default_locale: 'fr' },
    { name: '__MSG_x__' },
    { name: '__MSG_x__', default_locale: '../..' },
    { name: '__MSG_x y__', default_locale: 'fr' },
    null,
    'texte'
  ])
    strictEqual(cibleNomLocalise(mauvais), null)
  strictEqual(messageLocalise({ EXTNAME: { message: 'Mon nom' } }, 'extName'), 'Mon nom')
  for (const mauvais of [
    {},
    { extName: {} },
    { extName: { message: '  ' } },
    { extName: { message: 3 } },
    [],
    null,
    'x'
  ])
    strictEqual(messageLocalise(mauvais, 'extName'), null)
})
