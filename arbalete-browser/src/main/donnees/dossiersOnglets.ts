import type { DatabaseSync } from 'node:sqlite'
import { nomDossierOngletValide, type DossierOnglet } from '../../shared/dossiersOnglets.ts'

// Dossiers d'onglets (ARB-69) : dépôt sur la table `dossier_onglet`. L'appartenance d'un onglet à un dossier est écrite
// avec la session (session.ts, colonne `onglet.dossier`).

export type DossierOngletEspace = DossierOnglet & { espace: number }

function validerId(id: number): void {
  if (!Number.isSafeInteger(id)) throw new Error('Identifiant de dossier invalide')
}

function nomSur(nom: string): string {
  const propre = nomDossierOngletValide(nom)
  if (propre === null) throw new Error('Nom de dossier invalide')
  return propre
}

// Tous les dossiers, dans l'ordre de création.
export function lireDossiersOnglets(db: DatabaseSync): DossierOngletEspace[] {
  const lignes = db.prepare('SELECT id, nom, espace, replie FROM dossier_onglet ORDER BY id').all() as Array<{
    id: number
    nom: string
    espace: number
    replie: number
  }>
  return lignes.map((ligne) => ({ id: ligne.id, nom: ligne.nom, espace: ligne.espace, replie: ligne.replie === 1 }))
}

// Renvoie l'id du dossier créé ; lève une erreur si l'espace n'existe pas (clé étrangère) ou si le nom est invalide.
export function creerDossierOnglet(db: DatabaseSync, espace: number, nom: string): number {
  validerId(espace)
  return Number(
    db.prepare('INSERT INTO dossier_onglet (nom, espace) VALUES (?, ?)').run(nomSur(nom), espace).lastInsertRowid
  )
}

// Les trois fonctions renvoient faux si le dossier n'existe pas.
export function renommerDossierOnglet(db: DatabaseSync, id: number, nom: string): boolean {
  validerId(id)
  return db.prepare('UPDATE dossier_onglet SET nom = ? WHERE id = ?').run(nomSur(nom), id).changes > 0
}

export function replierDossierOnglet(db: DatabaseSync, id: number, replie: boolean): boolean {
  validerId(id)
  return db.prepare('UPDATE dossier_onglet SET replie = ? WHERE id = ?').run(replie ? 1 : 0, id).changes > 0
}

// Les onglets du dossier supprimé restent ouverts, à la racine.
export function supprimerDossierOnglet(db: DatabaseSync, id: number): boolean {
  validerId(id)
  return db.prepare('DELETE FROM dossier_onglet WHERE id = ?').run(id).changes > 0
}
