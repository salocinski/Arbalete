import type { DatabaseSync } from 'node:sqlite'
import { nomPartitionProfil, nomProfilValide, PROFIL_PRINCIPAL, type Profil } from '../../shared/profils.ts'
import { enTransaction } from './transaction.ts'

// Profils (ARB-143, décision 0007) : dépôt sur la table `profil`. Le profil 1 (session par défaut d'Electron) existe depuis
// la migration 11 ; il se renomme mais ne se supprime pas.

export type ProfilStocke = Profil & { partition: string | null }

function validerId(id: number): void {
  if (!Number.isSafeInteger(id)) throw new Error('Identifiant de profil invalide')
}

export function lireProfils(db: DatabaseSync): ProfilStocke[] {
  return (db.prepare('SELECT id, nom, partition FROM profil ORDER BY position, id').all() as ProfilStocke[]).map(
    (p) => ({ ...p })
  )
}

// Crée le profil en dernière position, avec sa partition, et renvoie son id.
export function creerProfil(db: DatabaseSync, nom: string): number {
  const propre = nomProfilValide(nom)
  if (!propre) throw new Error('Nom de profil invalide')
  return enTransaction(db, () => {
    const resultat = db
      .prepare('INSERT INTO profil (nom, position) VALUES (?, (SELECT COALESCE(MAX(position) + 1, 0) FROM profil))')
      .run(propre)
    const id = Number(resultat.lastInsertRowid)
    db.prepare('UPDATE profil SET partition = ? WHERE id = ?').run(nomPartitionProfil(id), id)
    return id
  })
}

// Renvoie faux si le profil n'existe pas.
export function renommerProfil(db: DatabaseSync, id: number, nom: string): boolean {
  validerId(id)
  const propre = nomProfilValide(nom)
  if (!propre) throw new Error('Nom de profil invalide')
  return db.prepare('UPDATE profil SET nom = ? WHERE id = ?').run(propre, id).changes > 0
}

// Refuse le profil principal et un profil qui a encore des espaces (aucun onglet ne change de session sans que l'utilisateur
// l'ait demandé). Renvoie la partition à effacer, ou null si le profil n'existe pas.
export function supprimerProfil(db: DatabaseSync, id: number): { partition: string | null } | null {
  validerId(id)
  if (id === PROFIL_PRINCIPAL) throw new Error('Le profil principal ne se supprime pas')
  return enTransaction(db, () => {
    const profil = lireProfils(db).find((p) => p.id === id)
    if (!profil) return null
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM espace WHERE profil = ?').get(id) as { n: number }
    if (n > 0) throw new Error('Ce profil a encore des espaces')
    db.prepare('DELETE FROM profil WHERE id = ?').run(id)
    return { partition: profil.partition }
  })
}

// Rattache l'espace au profil. Renvoie faux si l'espace ou le profil n'existe pas.
export function definirProfilEspace(db: DatabaseSync, espace: number, profil: number): boolean {
  validerId(espace)
  validerId(profil)
  if (!lireProfils(db).some((p) => p.id === profil)) return false
  return db.prepare('UPDATE espace SET profil = ? WHERE id = ?').run(profil, espace).changes > 0
}
