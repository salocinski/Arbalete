# 0004 — Extensions Chrome : Go conditionnel avec Electron et `electron-chrome-extensions`

- **Statut** : proposée (ARB-27, EP-04) ; devient acceptée à la validation de la PR par le propriétaire
- **Date** : 2026-11-14
- **Concerne** : prise en charge des extensions Chrome dans Arbalète ; relevés `docs/extensions/arb-23-…`, `arb-24-…`, `arb-25-…`, `arb-26-…`

## Contexte

Arbalète vise la compatibilité avec les extensions Chrome. Electron ne fournit qu'une partie des API `chrome.*` et ne gère ni le Web Store ni les `.crx`. Quatre POC (ARB-23 à ARB-26) ont mesuré ce que donnent Electron seul puis la bibliothèque `electron-chrome-extensions` (MIT, compatible GPL-3.0) sur cinq extensions cibles, sous Electron 45.2.3 (Chromium 156).

## Rapport de compatibilité

| Extension | Electron seul (ARB-24) | Avec la bibliothèque (ARB-25, ARB-26) | Blocage restant |
|---|---|---|---|
| Dark Reader | Fonctionne | Fonctionne, popup affichée | Aucun |
| Bitwarden | Service worker plante (`webNavigation`) | **Fonctionne**, popup affichée | `sidePanel`, `privacy` inconnus ; autoremplissage non essayé |
| Immersive Translate | Non testé | **Fonctionne**, popup affichée | Effet sur les pages non vérifié |
| uBlock Origin Lite | Service worker plante (`chrome.commands`) | Plante toujours | `chrome.commands` ; blocage par `declarativeNetRequest` jamais essayé |
| 1Password | Non testé | Service worker plante (espace de noms `chrome.*` indéfini, `WINDOW_ID_NONE`) | Même corrigé : `nativeMessaging` absent, donc aucun lien avec l'application de bureau |

Trois extensions sur cinq fonctionnent au niveau démarrage et popup. Il n'y a pas encore de preuve d'un usage complet (autoremplissage, traduction d'une page, blocage réel).

## Options

| Option | Pour | Contre |
|---|---|---|
| **A. Electron + `electron-chrome-extensions`** | Déjà en place ; MIT ; barre d'actions, popups, `tabs`, `windows`, `webNavigation` fournis ; trois extensions sur cinq démarrent | Couverture partielle des API ; `webRequest` neutralisé ; scripts d'arrière-plan toujours persistants ; pas de session privée ; dépendance tierce à maintenir |
| B. A + compléments propres à Arbalète | Peut combler des trous ciblés (`chrome.commands` factice pour uBOL Lite) | Du code à maintenir par API, risque de comportement faux sans erreur visible |
| C. CEF ou fork de Chromium | Prise en charge complète des extensions, `nativeMessaging` compris | Abandon de l'architecture Electron actuelle, build et mises à jour de sécurité de Chromium à notre charge : hors de portée d'un projet de cette taille |

Les alternatives (C) n'ont pas été essayées : l'énoncé d'ARB-27 les réserve au cas où Electron ne suffirait pas, et il suffit pour les cas d'usage visés.

## Décision

**Go conditionnel, option A, avec B au cas par cas.** Pas de CEF ni de fork de Chromium.

- Les extensions de la classe « scripts de contenu, popup, `storage`, `tabs`, `webNavigation` » (Dark Reader, Bitwarden, Immersive Translate) sont dans le périmètre d'EP-04.
- **uBlock Origin Lite** : un `chrome.commands` factice (`getAll` vide, `onCommand` sans effet) est à essayer ; la décision pour cette extension dépend de la preuve que `declarativeNetRequest` bloque réellement. Sans cette preuve, elle est hors périmètre.
- **1Password** : **No-Go** tant qu'aucune solution pour `nativeMessaging` n'existe. Une extension qui a besoin d'une application de bureau n'est pas prise en charge ; elle reste notée comme limite connue.
- Rien n'est activé dans l'application avant l'audit de sécurité d'EP-04 (ARB-95) : une extension tourne avec des droits larges, et le flux d'installation depuis le Store (téléchargement, vérification de la signature du `.crx`, mises à jour, retrait) n'est pas conçu.

## Conditions de réexamen

Revenir sur cette décision (et rouvrir l'option C) si l'un de ces points se produit : `declarativeNetRequest` ne se laisse pas combler et uBOL Lite est jugé indispensable ; `nativeMessaging` devient une exigence ; la bibliothèque n'est plus maintenue ou n'accepte plus la version d'Electron suivie (elle n'annonce que Electron 44, 45 fonctionne sans écart constaté).

## Limites acceptées

- shortcut : la bibliothèque est lue depuis `.poc/lib/`, elle n'est pas encore une dépendance d'Arbalète ; l'ajouter (version exacte, licence MIT vérifiée) est le premier ticket après l'audit.
- shortcut : le POC prend la dernière version des extensions et ne vérifie pas la signature des `.crx`.
- Effets réels non mesurés : autoremplissage de Bitwarden, traduction d'Immersive Translate, blocage de uBOL Lite.
