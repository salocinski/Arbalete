# ARB-144 : extensions Chrome, installation et gestion

Suite de la décision 0004 (option A : Electron + `electron-chrome-extensions` 4.10.0, MIT). **Éteint par défaut** : rien
n'est créé ni chargé tant que le réglage « Activer les extensions Chrome » (Paramètres, `pref.extensions.actif`) est faux ;
un changement ne s'applique qu'au redémarrage. Il restera éteint jusqu'à l'audit de sécurité EP-04 (ARB-162).

## Ce qui est fait
- Source d'installation : un **dossier décompressé** choisi dans une boîte système (Manifest V3 seulement). Le dossier est
  copié dans `<userData>/extensions/<profil>/<uuid>/` (pas de lien symbolique, 100 Mo, 5000 fichiers, 12 niveaux au plus ;
  copie dans un dossier temporaire puis renommage).
- Une extension s'ajoute **inactive** ; ses permissions sont listées en français avant de l'activer.
- Une installation par profil (ARB-143) ; supprimer un profil efface ses extensions (ligne en cascade, copies effacées).
- Gestion : activer, désactiver, retirer (Paramètres, section « Extensions »). Une extension qui ne se charge pas est marquée
  « erreur de chargement » sans gêner le navigateur.
- Tests : `shared/extensions.test.ts`, `donnees/extensions.test.ts` (migration 12), `main/extensions.test.ts` (bibliothèque
  factice), smoke C106 (canaux réservés à la vue de la barre, éteint par défaut).

## Limites connues
- Jeu d'extensions réel (Dark Reader, Bitwarden, uBOL Lite) **non rejoué** avec le gestionnaire : le chargement réel reste
  manuel, sous Electron 45 (bibliothèque annoncée pour Electron 44).
- Pas de barre d'actions ni de popups d'extension (ARB-160) ; l'installation depuis le Web Store est faite par ARB-161 (`arb-161-web-store.md`).
- `securiserSession` refuse toute permission à une page qui n'est pas l'onglet actif : les pages d'extension sont refusées
  (ARB-140, refus par défaut, non fait).
- Pas de `chrome.commands`, `sidePanel`, `privacy`, `nativeMessaging` (uBOL Lite conditionnel, 1Password No-Go).
- Mémoire des processus d'extension non mesurée. La copie d'une extension est synchrone (jusqu'à 100 Mo, bloque l'interface le
  temps de la copie) ; une copie orpheline (arrêt entre le renommage et l'écriture en base) n'est pas purgée au démarrage.
- Le manifest affiché est celui de la copie ; les permissions comptent aussi les adresses des scripts de contenu, mais pas
  `optional_permissions`.
- Le nom localisé (`__MSG_…__`) s'affiche tel quel.
