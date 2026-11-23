import type { DatabaseSync } from 'node:sqlite'
import { dossierExtensionValide, type Extension } from '../../shared/extensions.ts'
import { ID_STORE } from '../../shared/webStore.ts'

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
  store_id: string | null
}

function enExtension(l: Ligne): Extension {
  let permissions: string[] = []
  try {
    const lu: unknown = JSON.parse(l.permissions)
    if (Array.isArray(lu)) permissions = lu.filter((p): p is string => typeof p === 'string')
  } catch {
    // colonne illisible : l'extension s'affiche sans permissions plutôt que de casser la liste
  }
  const e: Extension = { id: l.id, profil: l.profil, nom: l.nom, version: l.version, permissions, actif: l.actif === 1 }
  if (l.store_id) e.storeId = l.store_id
  return e
}

function validerId(id: number): void {
  if (!Number.isSafeInteger(id)) throw new Error('Identifiant d’extension invalide')
}

export function listerExtensions(db: DatabaseSync, profil: number): Extension[] {
  validerId(profil)
  const lignes = db.prepare('SELECT * FROM extension WHERE profil = ? ORDER BY id').all(profil) as Ligne[]
  return lignes.map(enExtension)
}

// Extension d'un profil avec son dossier de copie, ou undefined (une extension d'un autre profil n'est jamais rendue).
export function extensionDuProfil(
  db: DatabaseSync,
  profil: number,
  id: number
): (Extension & { dossier: string }) | undefined {
  validerId(profil)
  validerId(id)
  const ligne = db.prepare('SELECT * FROM extension WHERE id = ? AND profil = ?').get(id, profil) as Ligne | undefined
  return ligne ? { ...enExtension(ligne), dossier: ligne.dossier } : undefined
}

// Extension du Web Store déjà installée dans le profil (une seule par identifiant, index unique de la migration 13).
export function extensionDuStore(db: DatabaseSync, profil: number, storeId: string): boolean {
  validerId(profil)
  return db.prepare('SELECT 1 FROM extension WHERE profil = ? AND store_id = ?').get(profil, storeId) !== undefined
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
  e: { profil: number; nom: string; version: string; permissions: string[]; dossier: string; storeId?: string },
  maintenant: number = Date.now()
): number {
  validerId(e.profil)
  if (!dossierExtensionValide(e.dossier)) throw new Error('Dossier d’extension invalide')
  if (e.storeId !== undefined && !ID_STORE.test(e.storeId)) throw new Error('Identifiant du Web Store invalide')
  const resultat = db
    .prepare(
      'INSERT INTO extension (profil, nom, version, dossier, permissions, ajoutee_le, store_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(e.profil, e.nom, e.version, e.dossier, JSON.stringify(e.permissions), maintenant, e.storeId ?? null)
  return Number(resultat.lastInsertRowid)
}

// Mise à jour d'une extension du Web Store : nouvelle copie, manifest et état. Renvoie faux si elle n'existe pas.
export function remplacerExtension(
  db: DatabaseSync,
  id: number,
  e: { nom: string; version: string; permissions: string[]; dossier: string; actif: boolean }
): boolean {
  validerId(id)
  if (!dossierExtensionValide(e.dossier)) throw new Error('Dossier d’extension invalide')
  return (
    db
      .prepare('UPDATE extension SET nom = ?, version = ?, permissions = ?, dossier = ?, actif = ? WHERE id = ?')
      .run(e.nom, e.version, JSON.stringify(e.permissions), e.dossier, e.actif ? 1 : 0, id).changes > 0
  )
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
