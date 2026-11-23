import type { DatabaseSync } from 'node:sqlite'
import { dossierExtensionValide, type Extension } from '../../shared/extensions.ts'

// Extensions Chrome installées (ARB-144, décision 0004) : dépôt sur la table `extension` (migration 12). Aucun contenu
// d'extension en base : les fichiers vivent dans la copie du profil, désignée par `dossier`.

type Ligne = {
  id: number
  profil: number
  nom: string
  version: string
  permissions: string
  actif: number
  dossier: string
}

function enExtension(l: Ligne): Extension {
  let permissions: string[] = []
  try {
    const lu: unknown = JSON.parse(l.permissions)
    if (Array.isArray(lu)) permissions = lu.filter((p): p is string => typeof p === 'string')
  } catch {
    // colonne illisible : l'extension s'affiche sans permissions plutôt que de casser la liste
  }
  return { id: l.id, profil: l.profil, nom: l.nom, version: l.version, permissions, actif: l.actif === 1 }
}

function validerId(id: number): void {
  if (!Number.isSafeInteger(id)) throw new Error('Identifiant d’extension invalide')
}

export function listerExtensions(db: DatabaseSync, profil: number): Extension[] {
  validerId(profil)
  const lignes = db.prepare('SELECT * FROM extension WHERE profil = ? ORDER BY id').all(profil) as Ligne[]
  return lignes.map(enExtension)
}

// Dossier de copie d'une extension, ou undefined si elle n'existe pas.
export function dossierExtension(db: DatabaseSync, id: number): string | undefined {
  validerId(id)
  const ligne = db.prepare('SELECT dossier FROM extension WHERE id = ?').get(id) as { dossier: string } | undefined
  return ligne?.dossier
}

// Dossiers de copie de toutes les extensions d'un profil (à effacer avant de supprimer le profil, ARB-144).
export function dossiersDuProfil(db: DatabaseSync, profil: number): string[] {
  validerId(profil)
  return (
    db.prepare('SELECT dossier FROM extension WHERE profil = ? ORDER BY id').all(profil) as { dossier: string }[]
  ).map((l) => l.dossier)
}

// Ajoute l'extension (inactive) et renvoie son id. Le manifest est déjà validé par `validerManifest` ; `dossier` doit être
// un nom généré (pas un chemin), sinon l'écriture est refusée.
export function ajouterExtension(
  db: DatabaseSync,
  e: { profil: number; nom: string; version: string; permissions: string[]; dossier: string },
  maintenant: number = Date.now()
): number {
  validerId(e.profil)
  if (!dossierExtensionValide(e.dossier)) throw new Error('Dossier d’extension invalide')
  const resultat = db
    .prepare('INSERT INTO extension (profil, nom, version, dossier, permissions, ajoutee_le) VALUES (?, ?, ?, ?, ?, ?)')
    .run(e.profil, e.nom, e.version, e.dossier, JSON.stringify(e.permissions), maintenant)
  return Number(resultat.lastInsertRowid)
}

// Renvoie faux si l'extension n'existe pas.
export function definirExtensionActive(db: DatabaseSync, id: number, actif: boolean): boolean {
  validerId(id)
  return db.prepare('UPDATE extension SET actif = ? WHERE id = ?').run(actif ? 1 : 0, id).changes > 0
}

// Retire la ligne et renvoie son dossier de copie (à effacer par l'appelant), ou null si l'extension n'existe pas.
export function supprimerExtension(db: DatabaseSync, id: number): { dossier: string } | null {
  validerId(id)
  const dossier = dossierExtension(db, id)
  if (dossier === undefined) return null
  db.prepare('DELETE FROM extension WHERE id = ?').run(id)
  return { dossier }
}
