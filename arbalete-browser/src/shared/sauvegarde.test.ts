import { strictEqual } from 'node:assert/strict'
import { test } from 'node:test'
import { resumeImport } from './sauvegarde.ts'
import type { BilanImport } from './types.ts'

// Tests unitaires du texte de bilan d'une restauration (ARB-146).
const vide: BilanImport = {
  favoris: 0,
  pages: 0,
  espaces: 0,
  profils: 0,
  permissions: 0,
  archive: 0,
  conflits: 0,
  reglages: false
}

test('un bilan vide dit « rien de nouveau »', () => {
  strictEqual(resumeImport(vide), 'rien de nouveau')
})

test('seul ce qui compte est cité, au singulier ou au pluriel', () => {
  strictEqual(
    resumeImport({ ...vide, favoris: 1, pages: 2, profils: 1, permissions: 3, archive: 1, reglages: true }),
    '1 favori, 2 pages d’historique, 1 profil, 3 permissions de site, 1 onglet archivé, les réglages'
  )
  strictEqual(resumeImport({ ...vide, conflits: 4 }), 'rien de nouveau')
})
