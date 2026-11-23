import type { DatabaseSync } from 'node:sqlite'
import { enTransaction } from './transaction.ts'

// Schéma de la base, une entrée par version (décision 0001) : la migration d'indice i fait passer user_version de i à
// i + 1. Ne jamais modifier une migration publiée, en ajouter une nouvelle à la fin.
export const MIGRATIONS: readonly string[] = [
  // 1 — Session (ARB-44/45) : onglets ouverts dans leur ordre, l'onglet actif marqué.
  `CREATE TABLE onglet (
    position INTEGER PRIMARY KEY,
    url TEXT NOT NULL,
    titre TEXT NOT NULL DEFAULT '',
    actif INTEGER NOT NULL DEFAULT 0 CHECK (actif IN (0, 1))
  )`,
  // 2 — État de l'application (ARB-46) : notes clé/valeur, dont celle d'une session ouverte non refermée.
  `CREATE TABLE etat (
    cle TEXT PRIMARY KEY,
    valeur TEXT NOT NULL
  )`,
  // 3 — Historique (ARB-51) : une page par adresse, avec son titre, son nombre de visites et sa dernière visite ; une
  // visite datée par navigation, pour le regroupement par jour (ARB-52) et l'effacement par période (ARB-54). Dates en
  // millisecondes depuis 1970.
  `CREATE TABLE page (
    id INTEGER PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    titre TEXT NOT NULL DEFAULT '',
    visites INTEGER NOT NULL DEFAULT 0,
    derniere_visite INTEGER NOT NULL
  );
  CREATE TABLE visite (
    id INTEGER PRIMARY KEY,
    page INTEGER NOT NULL REFERENCES page (id) ON DELETE CASCADE,
    date INTEGER NOT NULL
  );
  CREATE INDEX visite_date ON visite (date);
  CREATE INDEX visite_page ON visite (page)`,
  // 4 — Favoris (ARB-47) : une ligne par adresse, avec le titre de la page à l'ajout et la date d'ajout (millisecondes
  // depuis 1970). Les dossiers (ARB-48) s'ajoutent par la migration 7.
  `CREATE TABLE favori (
    id INTEGER PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    titre TEXT NOT NULL DEFAULT '',
    date INTEGER NOT NULL
  )`,
  // 5 — Espaces (ARB-60) : nom, couleur (nom d'un token), icône et ordre (position croissante) ; chaque onglet de la
  // session peut appartenir à un espace (NULL : aucun, ou espace supprimé).
  `CREATE TABLE espace (
    id INTEGER PRIMARY KEY,
    nom TEXT NOT NULL,
    couleur TEXT NOT NULL,
    icone TEXT NOT NULL,
    position INTEGER NOT NULL
  );
  ALTER TABLE onglet ADD COLUMN espace INTEGER REFERENCES espace (id) ON DELETE SET NULL`,
  // 6 — Téléchargements (ARB-55) : adresse d'origine (sans identifiants), nom et chemin du fichier, octets reçus et
  // attendus (total 0 : taille inconnue), état et date de début (millisecondes depuis 1970).
  `CREATE TABLE telechargement (
    id INTEGER PRIMARY KEY,
    url TEXT NOT NULL,
    nom TEXT NOT NULL,
    chemin TEXT NOT NULL,
    total INTEGER NOT NULL DEFAULT 0,
    recu INTEGER NOT NULL DEFAULT 0,
    etat TEXT NOT NULL CHECK (etat IN ('en-cours', 'en-pause', 'termine', 'annule', 'interrompu')),
    date INTEGER NOT NULL
  )`,
  // 7 — Dossiers de favoris (ARB-48) : un niveau, dans l'ordre de création ; un favori sans dossier (NULL) reste à la
  // racine, y compris quand son dossier est supprimé.
  `CREATE TABLE dossier_favori (
    id INTEGER PRIMARY KEY,
    nom TEXT NOT NULL
  );
  ALTER TABLE favori ADD COLUMN dossier INTEGER REFERENCES dossier_favori (id) ON DELETE SET NULL`,
  // 8 — Onglets épinglés et archivage (ARB-64) : l'épinglage et le dernier usage (millisecondes depuis 1970, NULL : session
  // d'avant, lu comme « maintenant ») de chaque onglet de la session ; l'archive garde les onglets fermés par le délai, avec
  // leur espace (NULL : aucun, ou espace supprimé).
  `ALTER TABLE onglet ADD COLUMN epingle INTEGER NOT NULL DEFAULT 0 CHECK (epingle IN (0, 1));
  ALTER TABLE onglet ADD COLUMN activite INTEGER;
  CREATE TABLE archive (
    id INTEGER PRIMARY KEY,
    url TEXT NOT NULL,
    titre TEXT NOT NULL DEFAULT '',
    espace INTEGER REFERENCES espace (id) ON DELETE SET NULL,
    date INTEGER NOT NULL
  )`,
  // 9 — Dossiers d'onglets (ARB-69) : un dossier appartient à un espace (supprimé avec lui) et peut être replié ; un onglet
  // de la session peut être rangé dans un dossier (NULL : à la racine, y compris quand son dossier est supprimé).
  `CREATE TABLE dossier_onglet (
    id INTEGER PRIMARY KEY,
    nom TEXT NOT NULL,
    espace INTEGER NOT NULL REFERENCES espace (id) ON DELETE CASCADE,
    replie INTEGER NOT NULL DEFAULT 0 CHECK (replie IN (0, 1))
  );
  ALTER TABLE onglet ADD COLUMN dossier INTEGER REFERENCES dossier_onglet (id) ON DELETE SET NULL`,
  // 10 — Session isolée par espace (ARB-65) : 1 = les onglets de l'espace vivent dans leur propre partition (cookies,
  // stockage et cache séparés), 0 = la session commune.
  `ALTER TABLE espace ADD COLUMN isole INTEGER NOT NULL DEFAULT 0 CHECK (isole IN (0, 1))`,
  // 11 — Profils (ARB-143, décision 0007) : contexte de navigation nommé ; `partition` NULL = session par défaut d'Electron
  // (profil 1, « Principal »), sinon nom de partition persistante. Un espace isolé (ARB-65) devient un profil qui garde sa
  // partition `persist:espace-<id>` (cookies conservés) ; les autres espaces vont au profil 1. `espace.isole` reste en base,
  // inutilisée. La colonne `espace.profil` est nullable (SQLite refuse NOT NULL REFERENCES à l'ajout), NULL = profil 1.
  `CREATE TABLE profil (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    partition TEXT,
    position INTEGER NOT NULL
  );
  INSERT INTO profil (id, nom, partition, position) VALUES (1, 'Principal', NULL, 0);
  ALTER TABLE espace ADD COLUMN profil INTEGER REFERENCES profil (id);
  INSERT INTO profil (nom, partition, position)
    SELECT nom, 'persist:espace-' || id, 0 FROM espace WHERE isole = 1 ORDER BY position, id;
  UPDATE profil SET position = id;
  UPDATE espace SET profil = COALESCE((SELECT p.id FROM profil p WHERE p.partition = 'persist:espace-' || espace.id), 1)`,
  // 12 — Extensions Chrome (ARB-144, décision 0004) : une ligne par extension installée dans un profil. `dossier` est le nom
  // du sous-dossier de la copie (généré, jamais un chemin), `permissions` un tableau JSON lu et écrit d'un bloc. Supprimer un
  // profil supprime ses lignes (clés étrangères actives) : l'appelant efface avant les copies sur disque.
  `CREATE TABLE extension (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profil INTEGER NOT NULL REFERENCES profil (id) ON DELETE CASCADE,
    nom TEXT NOT NULL,
    version TEXT NOT NULL,
    dossier TEXT NOT NULL UNIQUE,
    permissions TEXT NOT NULL,
    actif INTEGER NOT NULL DEFAULT 0 CHECK (actif IN (0, 1)),
    ajoutee_le INTEGER NOT NULL
  );
  CREATE INDEX extension_profil ON extension (profil)`
]

export function versionDuSchema(db: DatabaseSync): number {
  return Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)
}

// Une base créée par une version plus récente d'Arbalète est refusée plutôt que lue avec un schéma inconnu.
export class BasePlusRecente extends Error {}

export function refuserBasePlusRecente(db: DatabaseSync, migrations: readonly string[] = MIGRATIONS): void {
  const version = versionDuSchema(db)
  if (version > migrations.length) {
    throw new BasePlusRecente(
      `Base au schéma ${version}, plus récente que cette version d'Arbalète (schéma ${migrations.length})`
    )
  }
}

// Applique les migrations manquantes, chacune dans sa transaction avec son numéro de version : un arrêt en cours de
// route laisse la base à la dernière version complète. La version est relue sous le verrou d'écriture : si une autre
// instance vient d'appliquer la migration, elle n'est pas rejouée.
export function appliquerMigrations(db: DatabaseSync, migrations: readonly string[] = MIGRATIONS): void {
  refuserBasePlusRecente(db, migrations)
  for (let cible = versionDuSchema(db) + 1; cible <= migrations.length; cible++) {
    enTransaction(db, () => {
      if (versionDuSchema(db) >= cible) return
      db.exec(migrations[cible - 1])
      db.exec(`PRAGMA user_version = ${cible}`)
    })
  }
}
