# 0005 — Adresses `file:` : disque local autorisé, chemins réseau et pages web refusés

- **Statut** : proposée (ARB-17, EP-02) ; devient acceptée à la validation de la PR par le propriétaire
- **Date** : 2026-11-14
- **Concerne** : `normalizeUrl` et `will-navigate` (`src/main/index.ts`), `src/main/fichierLocal.ts`

## Contexte

`normalizeUrl` acceptait toute adresse `file://` saisie dans la barre d'adresse, y compris un chemin réseau (`file://serveur/partage`). Sous Windows, ouvrir un tel chemin ouvre une connexion SMB vers le serveur et lui envoie un hachage NTLM du compte : un lien ou un texte collé suffit à le faire fuiter. Par ailleurs `will-navigate` laissait passer `file://` depuis n'importe quelle page.

## Essai

Une page `http://127.0.0.1` dans une fenêtre `sandbox` (Electron 45, Chromium 156) a tenté d'atteindre `file:///C:/Windows/win.ini` par `location.href` avec geste, clic sur un lien, `window.open`, `<iframe>` et `fetch`. Chromium bloque les cinq (« Not allowed to load local resource ») avant `will-navigate` et avant `setWindowOpenHandler`. La garde du processus principal double donc celle de Chromium ; elle ne comble pas un trou observé.

## Options

| Option | Pour | Contre |
|---|---|---|
| A. Tout autoriser (état antérieur) | Rien à faire | Fuite NTLM par chemin réseau |
| **B. Restreindre** | Garde l'ouverture de fichiers locaux, supprime le risque réel | Un partage réseau ne s'ouvre pas |
| C. Tout bloquer | Politique la plus simple | Perd un usage normal (PDF, HTML, exports locaux) ; plus strict que Chrome, Edge et Firefox |
| D. Confirmer à chaque ouverture | Laisse le choix | Bruit pour un geste volontaire ; l'utilisateur ne sait pas évaluer un chemin UNC |

## Décision

Option B :

1. Un fichier du disque local (`file:///C:/…`) saisi dans la barre d'adresse, ouvert au lancement d'un onglet ou restauré avec la session s'ouvre.
2. Un chemin réseau est refusé, quelle que soit son écriture : hôte (`file://serveur/…`), quatre barres (`file:////serveur/…`), antislashs. La saisie ouvre la page d'accueil, sans être envoyée au moteur de recherche.
3. Une page `http(s)` ne navigue pas vers `file:` (`will-navigate`). Un fichier local peut mener à un autre fichier local ou au web.
4. Pas de fenêtre de confirmation.

La règle tient dans `adresseFichierLocal` et `navigationAutorisee` (`src/main/fichierLocal.ts`, test `fichierLocal.test.ts`).

## Limites et suite

- `shortcut:` aucun hôte n'est admis. Si des partages réseau d'entreprise deviennent un besoin, ajouter une confirmation ou une liste d'hôtes de confiance.
- Les chemins UNC ne sont pas vérifiés dans l'app avec un vrai serveur SMB : seule la règle d'analyse d'adresse est testée.
- Ni les téléchargements ni l'import de favoris ne sont concernés : ils n'acceptent déjà que le web (`telechargements.ts`, `importFavoris.ts`).
