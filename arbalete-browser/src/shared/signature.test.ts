import { test } from 'node:test'
import assert from 'node:assert/strict'
import { majLatest } from './signature.ts'

const latest = `version: 0.12.44023
files:
  - url: Arbalete-Setup-0.12.44023.exe
    sha512: ancien==
    size: 100
    blockMapSize: 5
path: Arbalete-Setup-0.12.44023.exe
sha512: ancien==
releaseDate: '2026-11-16T10:00:00.000Z'
`

test('majLatest remplace les deux sha512 et la taille, et retire blockMapSize', () => {
  const r = majLatest(latest, 'nouveau==', 250)
  assert.equal(r.match(/sha512: nouveau==/g)?.length, 2)
  assert.match(r, /^ {4}size: 250$/m)
  assert.ok(!r.includes('ancien') && !r.includes('blockMapSize'))
  assert.match(r, /^version: 0\.12\.44023$/m)
  assert.match(r, /^releaseDate: '2026-11-16T10:00:00\.000Z'$/m)
})

test('majLatest garde les fins de ligne CRLF', () => {
  const r = majLatest(latest.replace(/\n/g, '\r\n'), 'nouveau==', 250)
  assert.ok(r.includes('sha512: nouveau==\r\n') && !/[^\r]\n/.test(r))
})

test('majLatest refuse un latest.yml au format inattendu', () => {
  assert.throws(() => majLatest('version: 1.0.0\n', 'x', 1), /inattendu/)
  assert.throws(() => majLatest(latest.replace('    size: 100\n', ''), 'x', 1), /inattendu/)
})
