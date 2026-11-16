import { strictEqual } from 'node:assert/strict'
import { test } from 'node:test'
import { prochainFocus } from './focus.ts'

// Piège de focus des modales (ARB-126).
test('prochainFocus boucle dans la modale, dans les deux sens', () => {
  strictEqual(prochainFocus(0, 3, false), 1)
  strictEqual(prochainFocus(2, 3, false), 0)
  strictEqual(prochainFocus(0, 3, true), 2)
  strictEqual(prochainFocus(1, 3, true), 0)
})

test('prochainFocus : focus hors de la liste (panneau) ou liste vide', () => {
  strictEqual(prochainFocus(-1, 3, false), 0)
  strictEqual(prochainFocus(-1, 3, true), 2)
  strictEqual(prochainFocus(-1, 0, false), -1)
  strictEqual(prochainFocus(0, 1, false), 0)
})
