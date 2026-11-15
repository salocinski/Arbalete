# ARB-26 — POC : télécharger un `.crx` du Chrome Web Store et le charger

Relevé du 2026-11-14 sous Windows 10, **Electron 45.2.3 (Chromium 156.0.8078.80)**, bibliothèque `electron-chrome-extensions` 4.10.0. Hors application : Arbalète ne charge toujours aucune extension tant que l'audit de sécurité d'EP-04 (ARB-95) n'est pas fait. Les fichiers vivent dans `arbalete-browser/.poc/` (ignoré par Git) et ne s'essaient que dans un profil jetable sous `%TEMP%`.

## Méthode

1. **Téléchargement** : le serveur de mises à jour du Store répond à une URL de la forme `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=<version de Chrome>&acceptformat=crx2,crx3&x=id%3D<id de l'extension>%26uc`. Il redirige (302) vers le `.crx` de la dernière version. Accord de l'utilisateur demandé avant, avec nom, source et taille.
2. **Décompression** : un `.crx` v3 est un zip précédé d'un en-tête (`Cr24`, version, taille de l'en-tête signé). On saute l'en-tête, on refuse tout chemin absolu ou contenant `..`, puis on extrait dans `.poc/ext/<nom>-<version>/`.
3. **Chargement** : le script d'ARB-25 (`scripts/poc-electron-chrome-extensions.mjs`) parcourt tout `.poc/ext/`, sans modification.

| Extension | Identifiant | Fichier | Taille | Version |
|---|---|---|---|---|
| 1Password | `aeblfdkhhhdcdjpifhhbdiojplfjncoa` | `1password.crx` | 18 374 695 octets | 8.12.44.33 (MV3) |
| Immersive Translate | `bpoadfkcbjbfhfodiogcnhhhpibjhbnh` | `immersive.crx` | 13 744 647 octets | 1.34.4.0 (MV3) |

Le téléchargement a abouti pour les deux ; la décompression donne 1046 et 127 fichiers.

## Résultats

| Extension | `loadExtension` | Service worker | Action | Popup | `chrome.tabs` (depuis la popup) |
|---|---|---|---|---|---|
| Immersive Translate 1.34.4 | Chargée | **Actif**, aucune erreur | Affichée | **Affichée** (`popup.html`, 341 caractères) | `query({})` renvoie la page de test |
| 1Password 8.12.44.33 | Chargée | **Plante au démarrage** (`Cannot read properties of undefined (reading 'WINDOW_ID_NONE')`) : un espace de noms `chrome.*` est indéfini dans le service worker, très probablement `chrome.windows` | Affichée | Ouverte mais **vide** (0 caractère, service worker absent) | `query({})` renvoie la page de test |

Les résultats des trois autres extensions (Dark Reader, Bitwarden, uBOL Lite) sont inchangés par rapport à ARB-25.

Critère du ticket (« une extension s'installe depuis son lien store ») : **atteint à la main** pour le téléchargement et le chargement ; **pas d'installation dans Arbalète** (voir ci-dessous).

## Ce qu'on retient

- Le téléchargement par le serveur de mises à jour ne demande ni compte ni navigateur : il suffit de l'identifiant. Il donne la dernière version du Store, pas une version choisie.
- **Immersive Translate fonctionne** avec la bibliothèque, comme Dark Reader et Bitwarden. Son effet sur les pages (traduction, scripts de contenu) n'a pas été vérifié : seul le démarrage, l'action et la popup le sont.
- **1Password est bloqué avant même `nativeMessaging`** : son service worker ne démarre pas. Même corrigé, le dialogue avec l'application de bureau (`nativeMessaging`, jamais fourni par Electron ni par la bibliothèque) manquerait : l'extension seule ne peut ni déverrouiller ni remplir.
- Avertissement de chargement commun : permissions `sidePanel`, `privacy`, `offscreen`, `webRequestAuthProvider` inconnues d'Electron.

## Non couvert

- **Installation dans Arbalète** : aucun écran, aucun code d'application. Un vrai flux (lien du Store, validation de la signature du `.crx`, mises à jour, retrait) reste à concevoir après l'audit ARB-95.
- **Signature du `.crx`** : l'en-tête signé n'est pas vérifié (shortcut du POC : le fichier vient du serveur de mises à jour du Store, en HTTPS ; à vérifier avant une vraie installation).
- Effet réel sur les pages d'Immersive Translate, `nativeMessaging` de 1Password, `offscreen`, panneau latéral, versions épinglées (le POC prend toujours la dernière).
