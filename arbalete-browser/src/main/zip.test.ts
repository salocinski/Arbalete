import { strictEqual, throws } from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fabriquerZip, type FichierZip } from './fabriqueCrx.ts'
import { extraireZip } from './zip.ts'

// Tests de l'extraction d'une archive hostile (ARB-161) : tout ce qui sort du dossier ou dépasse les limites est refusé.

const LIM = { octets: 1000, fichiers: 5, profondeur: 3 }

function extraire(fichiers: FichierZip[], lim = LIM) {
  const dossier = mkdtempSync(join(tmpdir(), 'arb161-'))
  try {
    extraireZip(fabriquerZip(fichiers), join(dossier, 'sortie'), lim)
    return { dossier, lu: (nom: string) => readFileSync(join(dossier, 'sortie', nom), 'utf8') }
  } catch (e) {
    rmSync(dossier, { recursive: true, force: true })
    throw e
  }
}

test('extrait fichiers stockés et compressés, dossiers compris', () => {
  const r = extraire([
    { nom: 'manifest.json', contenu: '{"a":1}' },
    { nom: 'img/', contenu: '', methode: 0 },
    { nom: 'img/a.txt', contenu: 'bonjour bonjour bonjour', methode: 0 },
    { nom: 'js/lib/b.js', contenu: 'x'.repeat(300) },
    { nom: 'vide.txt', contenu: '' }
  ])
  try {
    strictEqual(r.lu('manifest.json'), '{"a":1}')
    strictEqual(r.lu('img/a.txt'), 'bonjour bonjour bonjour')
    strictEqual(r.lu('js/lib/b.js').length, 300)
    strictEqual(r.lu('vide.txt'), '')
  } finally {
    rmSync(r.dossier, { recursive: true, force: true })
  }
})

test('refuse les chemins qui sortent du dossier ou ne valent rien sous Windows', () => {
  for (const nom of [
    '../x.js',
    'a/../../x.js',
    '/abs.js',
    'C:/x.js',
    'a\\b.js',
    'a//b.js',
    './x.js',
    'x.js.',
    'a/con.txt',
    'conin$',
    'a/CLOCK$.js',
    'a:b.js'
  ]) {
    throws(() => extraire([{ nom, contenu: 'x' }]), /Chemin refusé/, nom)
  }
})

test('refuse lien symbolique, chiffrement, doublon (casse ignorée), trop de fichiers, profondeur et taille', () => {
  throws(() => extraire([{ nom: 'l', contenu: 'cible', hote: 3, attributs: 0xa1ff << 16 }]), /Lien/)
  throws(() => extraire([{ nom: 'c', contenu: 'x', drapeaux: 1 }]), /chiffrée/)
  throws(
    () =>
      extraire([
        { nom: 'a.js', contenu: '1' },
        { nom: 'A.JS', contenu: '2' }
      ]),
    /Doublon/
  )
  throws(() => extraire(Array.from({ length: 6 }, (_, i) => ({ nom: `f${i}`, contenu: 'x' }))), /volumineuse/)
  throws(() => extraire([{ nom: 'a/b/c/d/e.js', contenu: 'x' }]), /profond/)
  throws(() => extraire([{ nom: 'gros', contenu: 'x'.repeat(1001) }]), /volumineuse/)
})

test('refuse une taille annoncée plus petite que le contenu, un CRC faux et une archive sans répertoire', () => {
  throws(() => extraire([{ nom: 'mens', contenu: 'x'.repeat(500), taille: 10 }]), /corrompue/)
  throws(() => extraire([{ nom: 'crc', contenu: 'abc', crc: 1 }]), /corrompue/)
  throws(() => extraireZip(Buffer.from('pas un zip du tout, rien'), join(tmpdir(), 'arb161-jamais'), LIM), /invalide/)
  strictEqual(existsSync(join(tmpdir(), 'arb161-jamais')), false)
})
