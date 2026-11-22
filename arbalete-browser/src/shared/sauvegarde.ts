import type { BilanImport } from './types.ts'

// Texte du bilan d'un import (ARB-146) : seulement ce qui compte, au singulier ou au pluriel.
const compte = (n: number, un: string, plusieurs: string): string => `${n} ${n > 1 ? plusieurs : un}`

export function resumeImport(b: BilanImport): string {
  const parts = [
    b.favoris > 0 && compte(b.favoris, 'favori', 'favoris'),
    b.pages > 0 && compte(b.pages, 'page d’historique', 'pages d’historique'),
    b.espaces > 0 && compte(b.espaces, 'espace', 'espaces'),
    b.profils > 0 && compte(b.profils, 'profil', 'profils'),
    b.permissions > 0 && compte(b.permissions, 'permission de site', 'permissions de site'),
    b.archive > 0 && compte(b.archive, 'onglet archivé', 'onglets archivés'),
    b.reglages && 'les réglages'
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : 'rien de nouveau'
}
