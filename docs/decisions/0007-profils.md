# 0007 — Profils de navigation (ARB-143)

Statut : **choisi le 2026-11-21** (revue du plan : colonne nullable, clés du profil 1 inchangées ; historique et favoris communs en v1, suppression refusée tant que des espaces y sont rattachés). Débloque ARB-144, 145, 146, 149, 152, 154, 156.

## Contexte

Depuis ARB-65, un espace peut être « isolé » : ses onglets vivent dans la partition `persist:espace-<id>` (cookies, stockage,
cache séparés). Ce n'est pas un profil : l'isolement est un booléen de l'espace, sans nom, sans partage entre espaces, et tout
le reste est commun (permissions et zoom par hôte dans `etat`, historique, favoris). Arbalète n'a qu'une fenêtre.

## Décision proposée

**Un profil est un contexte Chromium nommé auquel des espaces sont rattachés.** Le profil actif est celui de l'espace affiché.

### Modèle de données (migration 11)

```
profil (id INTEGER PK, nom TEXT NOT NULL, partition TEXT, position INTEGER NOT NULL)
espace.profil INTEGER REFERENCES profil (id)   -- NULL lu comme le profil 1
```

`ALTER TABLE ADD COLUMN` refuse une colonne `NOT NULL REFERENCES` sans défaut NULL quand `foreign_keys = ON` (c'est le cas,
`base.ts:24`) : la colonne est donc nullable, comme `onglet.espace` (migration 5), et `NULL` vaut le profil 1. La migration
renseigne tout de même chaque espace ; `NULL` ne reste que pour un espace créé par un chemin qui l'oublierait.

- `partition` NULL = session par défaut d'Electron (la session commune d'aujourd'hui) ; sinon nom de partition persistante,
  `persist:profil-<id>` pour un profil créé après la migration.
- Profil 1 « Principal » (partition NULL) : toujours présent, ni supprimable ni renommable en NULL ; c'est la migration de la
  session commune, sans perte de cookies.
- Migration des espaces isolés d'ARB-65 : un profil par espace `isole = 1`, nommé comme l'espace, avec `partition =
  'persist:espace-<id>'` (les cookies existants restent lisibles : on ne renomme pas la partition). Les autres espaces
  reçoivent le profil 1. La colonne `espace.isole` reste en base, inutilisée (pas de `DROP COLUMN`, base plus récente refusée
  par les anciennes versions de toute façon) ; `isolerEspace` et le canal `set-workspace-isolation` disparaissent.
- ON DELETE : pas de cascade ; supprimer un profil qui a encore des espaces est refusé (l'utilisateur les déplace ou les
  supprime d'abord).

### Isolation (ce qui suit le profil)

| Donnée | v1 | Où |
|---|---|---|
| Cookies, cache, stockage local, service workers | par profil | partition Electron |
| Décisions de permissions de site, zoom par site, pop-ups autorisées | par profil | le profil 1 garde les clés actuelles (`pref.permission.<hôte>.…`, aucune migration), les autres préfixent l'hôte de `<id>@` (`@` est impossible dans un nom d'hôte : aucune collision avec un vrai sous-domaine) ; le gestionnaire de permissions de chaque session capture son profil (`securiserSession` est déjà par session) |
| Téléchargements, historique, favoris, archive, réglages | **communs** (hors v1) | tables actuelles |

L'historique et les favoris par profil changent le modèle (colonne `profil` sur `page`, `visite`, `favori`, `dossier_favori`,
export, suggestions) : sous-ticket séparé si l'usage le demande. Écart assumé avec la fiche du document (« historique »).

### Rattachement et profil actif

- Un espace a un profil ; `sessionEspace(espace)` devient `sessionProfil(espace)` (même `securiserSession`, une fois par
  session). Changer l'espace d'un profil recharge ses onglets par `renouvelerVue` (comme ARB-65, même limites : Précédent /
  Suivant, défilement et formulaires perdus ; vue partagée terminée si elle touche l'espace).
- Le profil actif = profil de l'espace affiché : nom du profil dans le sélecteur d'espace et dans le menu de l'espace, pastille
  hors profil Principal. Aucune notion de fenêtre par profil : une seule fenêtre, onglets de profils différents côte à côte.
- Persistance : par `espace.profil` et la clé existante de l'espace actif, rien de plus.

### Canaux IPC (vue de la barre seule, `exigerBarre`, arguments validés)

`browser:list-profiles` (via `BrowserState.profiles`), `create-profile`, `rename-profile`, `delete-profile`,
`set-workspace-profile` (espace, profil), `clear-profile-data` (cookies, cache, stockage du profil seulement). Nom 1 à 40
caractères, comme un espace.

### Interface

Entrée « Profil… » du menu de l'espace (remplace « Isoler la session de cet espace ») : liste des profils, « Nouveau profil »,
renommer, supprimer, effacer les données. Composants existants (`MenuOverlay`, `Modal`, `Input`) ; `DESIGN.md` inchangé.

## Alternatives écartées

- **Une base SQLite par profil** : isolation complète (historique, favoris), mais migrations multipliées, export et recherche
  à refaire, favoris partagés impossibles. Trop pour la v1.
- **Profil = fenêtre** (modèle Chrome) : demande plusieurs fenêtres, dont l'application n'a pas l'architecture (un seul
  `index.ts` de fenêtre, vue de la barre unique).
- **Garder `espace.isole` et ajouter une table profil à côté** : deux mécanismes d'isolement pour la même chose.

## Points relevés à la revue

- `exportDonnees.ts:91` n'exporte que nom, couleur et icône d'un espace : un import rattache tout au profil 1, sans perte ni
  erreur. Exporter les profils relève d'ARB-146.
- « Effacer les cookies et le cache » (`index.ts`, boucle sur les espaces isolés) doit parcourir les profils à partition.
- `semerEspaces` suppose le profil 1 présent : la migration 11 l'insère avant tout espace.

## Tests

- Unitaires : `donnees/profils.test.ts` (création, noms, suppression refusée avec espaces, profil 1 intouchable, migration 11
  depuis un schéma 10 avec espaces isolés et non isolés, cookies gardés via `partition`), `shared/profils.test.ts`
  (validation, `nomPartition`).
- Smoke C102 : deux espaces de profils différents sur 127.0.0.1, un cookie posé dans l'un est absent dans l'autre ; effacer le
  profil B laisse A intact ; le profil de l'espace affiché revient au redémarrage.
- Manuels : deux vrais comptes d'un même site, suppression d'un profil avec partition.

## Risques

- Migration 11 irréversible : base de plus de version refusée par les anciennes versions (comportement existant) ; copie de
  secours (`sauvegarde.ts`) en place.
- Clés `pref.*` par hôte à migrer : un oubli donne des permissions « perdues » (ré-invite), jamais plus permissives.
- `securiserSession` doit couvrir chaque nouvelle partition avant le premier onglet (déjà le cas par `sessionEspace`).

## Hors périmètre

Historique et favoris par profil, fenêtres par profil, profil invité / navigation privée, synchronisation (ARB-156),
règles de routage (ARB-149), extensions par profil (ARB-144).
