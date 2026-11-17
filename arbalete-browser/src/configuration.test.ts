// Garde-fous de la configuration des outils (ARB-6, ARB-7) : cibles TypeScript séparées, Oxlint et Prettier branchés.
import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const racine = fileURLToPath(new URL('..', import.meta.url))
const json = (fichier: string) => JSON.parse(readFileSync(racine + fichier, 'utf8'))

test('le renderer n’a pas les types Node, ni le main le DOM (ARB-6)', () => {
  const web = json('tsconfig.web.json')
  const node = json('tsconfig.node.json')
  deepStrictEqual(web.compilerOptions.types, [])
  ok(web.compilerOptions.lib.includes('DOM'))
  ok(node.compilerOptions.types.includes('node'))
  ok(!node.compilerOptions.lib.includes('DOM'))
  // Les tests Playwright et les tests du renderer utilisent Node et le DOM.
  const test = json('tsconfig.test.json')
  ok(test.compilerOptions.types.includes('node'))
  ok(test.compilerOptions.lib.includes('DOM'))
})

test('tsconfig.json référence les trois cibles et typecheck les parcourt toutes (ARB-6)', () => {
  const references = json('tsconfig.json').references.map((r: { path: string }) => r.path)
  deepStrictEqual(references, ['./tsconfig.node.json', './tsconfig.web.json', './tsconfig.test.json'])
  strictEqual(json('package.json').scripts.typecheck, 'tsc -b')
})

test('Oxlint contrôle les hooks React et Prettier a ses scripts (ARB-7)', () => {
  const lint = json('.oxlintrc.json')
  strictEqual(lint.rules['react/rules-of-hooks'], 'error')
  strictEqual(lint.rules['react/exhaustive-deps'], 'error')
  const scripts = json('package.json').scripts
  strictEqual(scripts.lint, 'oxlint')
  strictEqual(scripts.format, 'prettier --write .')
  strictEqual(scripts['format:check'], 'prettier --check .')
  const prettier = json('.prettierrc.json')
  strictEqual(prettier.semi, false)
  strictEqual(prettier.endOfLine, 'lf')
})

test('le lanceur des tests unitaires ne trouve aucun fichier sans échouer (ARB-7)', () => {
  const lanceur = readFileSync(racine + 'scripts/test-unitaire.mjs', 'utf8')
  ok(lanceur.includes('process.exit(1)'))
})
