import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { WebContents } from 'electron'
import { adresseFichierLocal, cadreAutorise, filtrerCadres, navigationAutorisee } from './fichierLocal.ts'

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

test('cadreAutorise (ARB-139) : un fichier local n’est atteint que depuis une page en file:, le reste est laissé à Chromium', () => {
  const cas: [string, string, boolean][] = [
    // Vers un fichier : refusé depuis le web, une origine vide ou about:blank (premier chargement), data:, blob:.
    ['https://a.test/', 'file:///C:/a.html', false],
    ['', 'file:///C:/a.html', false],
    ['about:blank', 'file:///C:/a.html', false],
    ['data:text/html,x', 'file:///C:/a.html', false],
    ['blob:https://a.test/1', 'file:///C:/a.html', false],
    ['file:///C:/a.html', 'file://serveur/p', false],
    ['file:///C:/a.html', 'file:////serveur/p', false],
    ['file:///C:/a.html', 'file:///C:/b.html', true],
    // Vers autre chose : jamais jugé ici.
    ['https://a.test/', 'https://b.test/', true],
    ['', 'https://b.test/', true],
    ['https://a.test/', 'about:srcdoc', true],
    ['https://a.test/', 'data:text/html,x', true],
    ['https://a.test/', 'blob:https://a.test/1', true],
    ['https://a.test/', 'mailto:x@a.test', true],
    ['https://a.test/', 'msteams://x', true]
  ]
  for (const [depuis, vers, attendu] of cas) assert.equal(cadreAutorise(depuis, vers), attendu, depuis + ' -> ' + vers)
})

// Faux contenu : un EventEmitter qui garde l'URL courante, comme le fait WebContents pour filtrerCadres.
function fauxContenu(url: string) {
  const contenu = Object.assign(new EventEmitter(), { getURL: () => url })
  filtrerCadres(contenu as unknown as WebContents)
  return contenu
}
function annule(contenu: EventEmitter, evenement: string, url: string, isMainFrame: boolean): boolean {
  let refuse = false
  contenu.emit(evenement, { url, isMainFrame, preventDefault: () => (refuse = true) })
  return refuse
}

test('filtrerCadres (ARB-139) : sous-cadre et redirection vers un fichier sont annulés depuis le web ou un premier chargement', () => {
  for (const depuis of ['https://a.test/', '', 'about:blank']) {
    const page = fauxContenu(depuis)
    assert.equal(annule(page, 'will-frame-navigate', 'file:///C:/a.html', false), true, depuis)
    assert.equal(annule(page, 'will-redirect', 'file:///C:/a.html', false), true, depuis)
    assert.equal(annule(page, 'will-redirect', 'file:///C:/a.html', true), true, depuis)
    assert.equal(annule(page, 'will-redirect', 'file://serveur/p', true), true, depuis)
  }
})

test('filtrerCadres (ARB-139) : le web, les iframes data: et les schémas d’application ne sont pas touchés', () => {
  const page = fauxContenu('https://a.test/')
  assert.equal(annule(page, 'will-frame-navigate', 'https://b.test/', false), false)
  assert.equal(annule(page, 'will-frame-navigate', 'data:text/html,x', false), false)
  assert.equal(annule(page, 'will-redirect', 'https://b.test/', true), false)
  assert.equal(annule(page, 'will-redirect', 'msteams://x', true), false)
})

test('filtrerCadres (ARB-139) : le cadre principal reste à will-navigate, une page en file: garde ses fichiers locaux', () => {
  const page = fauxContenu('https://a.test/')
  // will-frame-navigate d'un cadre principal : déjà filtré par will-navigate, pas doublé ici.
  assert.equal(annule(page, 'will-frame-navigate', 'file:///C:/a.html', true), false)
  const fichier = fauxContenu('file:///C:/a.html')
  assert.equal(annule(fichier, 'will-frame-navigate', 'file:///C:/b.html', false), false)
  assert.equal(annule(fichier, 'will-redirect', 'file://serveur/p', false), true)
})

// Limite acceptée : garde-fou sur le texte de index.ts (un refactor qui déplace l'appel le fera échouer, à ajuster) ; un test
// de comportement exigerait de rendre `suivrePopup` testable, disproportionné ici.
test('filtrerCadres (ARB-139) est branché sur les onglets et sur les pop-ups', () => {
  const index = readFileSync(resolve(import.meta.dirname, 'index.ts'), 'utf8')
  const corps = (nom: string) => {
    const debut = index.indexOf('function ' + nom + '(')
    assert.ok(debut >= 0, nom)
    const fin = index.indexOf('\nfunction ', debut + 1)
    return index.slice(debut, fin < 0 ? undefined : fin)
  }
  assert.match(corps('suivrePopup'), /^\s*filtrerCadres\(contenu\)/m) // en début de ligne : pas en commentaire
  assert.match(index, /^\s*filtrerCadres\(view\.webContents\)/m)
})
