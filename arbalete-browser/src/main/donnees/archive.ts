import type { DatabaseSync } from 'node:sqlite'
import { ARCHIVE_GARDEE_MAX, type ElementArchive } from '../../shared/archivage.ts'
import { enTransaction } from './transaction.ts'

// Archive des onglets (ARB-64) : les plus récents d'abord, ARCHIVE_GARDEE_MAX au plus (les plus anciens sont oubliés).
// shortcut: la limite est fixe, sans écran pour vider l'archive ni la retrouver au-delà ; à régler si l'usage la déborde.
export type AArchiver = { url: string; titre: string; espace: number | null }

// Range ces onglets d'un bloc : un échec n'en laisse aucun à moitié écrit, et l'appelant ne ferme alors rien.
export function archiver(db: DatabaseSync, onglets: readonly AArchiver[], maintenant = Date.now()): void {
  const inserer = db.prepare(
    'INSERT INTO archive (url, titre, espace, date) VALUES (?, ?, (SELECT id FROM espace WHERE id = ?), ?)'
  )
  enTransaction(db, () => {
    for (const { url, titre, espace } of onglets) inserer.run(url, titre, espace, maintenant)
    db.prepare('DELETE FROM archive WHERE id NOT IN (SELECT id FROM archive ORDER BY date DESC, id DESC LIMIT ?)').run(
      ARCHIVE_GARDEE_MAX
    )
  })
}

export function listerArchive(db: DatabaseSync): ElementArchive[] {
  return (
    db.prepare('SELECT id, url, titre, date FROM archive ORDER BY date DESC, id DESC').all() as ElementArchive[]
  ).map((ligne) => ({ ...ligne }))
}

// Sort l'élément de l'archive et le rend ; undefined si l'id n'y est plus (déjà rouvert depuis une autre vue).
export function retirerDeLArchive(db: DatabaseSync, id: number): ElementArchive | undefined {
  return enTransaction(db, () => {
    const ligne = db.prepare('SELECT id, url, titre, date FROM archive WHERE id = ?').get(id) as
      ElementArchive | undefined
    if (!ligne) return undefined
    db.prepare('DELETE FROM archive WHERE id = ?').run(id)
    return { ...ligne }
  })
}
