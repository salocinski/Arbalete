import assert from 'node:assert/strict'
import { test } from 'node:test'
import { adresseFichierLocal, navigationAutorisee } from './fichierLocal.ts'

test('un fichier du disque local est accepté et normalisé', () => {
  assert.equal(adresseFichierLocal('file:///C:/Windows/win.ini'), 'file:///C:/Windows/win.ini')
  assert.equal(adresseFichierLocal('file:///C:/mes docs/a.html'), 'file:///C:/mes%20docs/a.html')
  assert.equal(adresseFichierLocal('file://localhost/C:/a.html'), 'file:///C:/a.html')
  assert.equal(adresseFichierLocal('FILE:C:/a.html'), 'file:///C:/a.html')
})

test('un chemin réseau (UNC) est refusé, sous toutes ses écritures', () => {
  for (const unc of [
    'file://serveur/partage/a.html',
    'file:////serveur/partage/a.html',
    'file:///\\serveur\\partage',
    'file:\\\\serveur\\partage\\a.html',
    'file://192.168.0.1/c$/a'
  ])
    assert.equal(adresseFichierLocal(unc), null, unc)
})

test('ce qui n’est pas un fichier est refusé', () => {
  for (const autre of ['https://example.com', 'javascript:alert(1)', 'C:\\a.html', '']) {
    assert.equal(adresseFichierLocal(autre), null, autre)
  }
})

test('une page web ne mène pas à un fichier, un fichier mène au web ou à un fichier', () => {
  assert.equal(navigationAutorisee('https://a.test/', 'https://b.test/'), true)
  assert.equal(navigationAutorisee('https://a.test/', 'file:///C:/a.html'), false)
  assert.equal(navigationAutorisee('http://127.0.0.1/', 'file:///C:/a.html'), false)
  assert.equal(navigationAutorisee('file:///C:/a.html', 'file:///C:/b.html'), true)
  assert.equal(navigationAutorisee('file:///C:/a.html', 'https://b.test/'), true)
  assert.equal(navigationAutorisee('file:///C:/a.html', 'file://serveur/p'), false)
  assert.equal(navigationAutorisee('https://a.test/', 'javascript:alert(1)'), false)
})
