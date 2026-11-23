# ARB-161 : installer une extension depuis le Chrome Web Store

Suite d'ARB-144 (décision 0004) et du POC ARB-26. Même garde-fou : **éteint par défaut** (`pref.extensions.actif`, lu au
démarrage), rien n'est téléchargé ni chargé tant que le réglage est faux.

## Ce qui est fait
- Paramètres › Extensions : un champ accepte l'**identifiant** (32 lettres a à p) ou le **lien de la fiche**
  (`chromewebstore.google.com/detail/<nom>/<id>` ou `chrome.google.com/webstore/detail/…`), le bouton « Installer depuis le
  Chrome Web Store » télécharge et ajoute l'extension **inactive** ; ses permissions sont listées avant de l'activer, comme
  pour un dossier. La source (« Chrome Web Store » ou « dossier local ») s'affiche sous chaque extension.
- Téléchargement dans le processus principal (`webStore.ts`, `net.request`) : serveur de mises à jour du Store
  (`clients2.google.com/service/update2/crx`, version du Chromium embarqué), redirections suivies à la main (4 au plus,
  https et hôtes `clients2.google.com`, `clients2.googleusercontent.com`, `*.gvt1.com` seulement), 100 Mo au plus, 120 s au plus.
- **Signature vérifiée** (`crx.ts`) : CRX3 seulement ; toutes les preuves de l'en-tête doivent signer « CRX3 SignedData » +
  l'archive, l'identifiant écrit dans l'en-tête doit être celui demandé, et au moins une preuve doit venir de la clé dont
  l'empreinte donne cet identifiant (règle de Chrome). Sinon : « Signature de l'extension invalide ».
- **Extraction maison** (`zip.ts`, `zlib` seul, aucune dépendance) : refuse chemins absolus, `..`, antislash, lecteur, noms
  réservés de Windows, liens symboliques, chiffrement, zip64, doublons (casse ignorée), plus de 5000 fichiers, 12 niveaux ou
  100 Mo (annoncés **et** réellement décompressés), CRC-32 faux. Écriture dans un dossier temporaire du profil, puis les mêmes
  contrôles et le même renommage qu'un dossier (`installerCopie`).
- Nom localisé (`__MSG_nom__`) résolu par `_locales/<langue par défaut>/messages.json`, pour les extensions du Store comme
  pour les dossiers.
- **Mise à jour à la demande** (« Rechercher une mise à jour », par extension du Store) : nouveau téléchargement, comparé
  par nombres à la version installée ; plus récente, la copie est remplacée (ancienne effacée, extension active rechargée).
  Si les permissions **s'élargissent**, l'extension revient **inactive** : l'utilisateur relit les permissions avant de la
  réactiver (comme Chrome).
- Base : migration 13 (`extension.store_id`, unique par profil), une extension du Store ne s'installe qu'une fois par profil.
- Tests : `crx.test.ts`, `zip.test.ts`, `webStore.test.ts` (main et shared), `extensionsStore.test.ts`, `shared/extensions.test.ts`,
  `donnees/extensions.test.ts`, smoke C106 (canaux réservés à la vue de la barre, arguments refusés).

## Limites connues
- `net.fetch` avec `redirect: 'manual'` (écarté) lève « Redirect was cancelled » sous Electron 45 (sondé) : le téléchargement passe par
  `net.request` (événement `redirect`, `creerRequeteNet`), sondé contre un serveur local (302 puis 200, sans cookie).
- Le téléchargement réel depuis le Store (hôtes de redirection réels, signature d'un vrai `.crx`) et le chargement d'une
  extension du Store sous Electron 45 ne sont **pas rejoués** : seuls des `.crx` fabriqués en test (clé RSA de test) le sont. Un hôte de
  redirection inattendu fait échouer l'installation avec « Redirection refusée : hôte non autorisé » ; à élargir au besoin.
- Pas de mise à jour automatique ni périodique (ARB-162 ou un ticket à part) ; la vérification retélécharge le `.crx`
  entier (jusqu'à 100 Mo) au lieu d'interroger le serveur de mises à jour en XML.
- Le téléchargement est tenu en mémoire (100 Mo au plus) et l'extraction est synchrone : l'interface peut se figer le temps
  de l'écriture (même limite que la copie d'une extension d'ARB-144).
- `optional_permissions`, `optional_host_permissions`, `externally_connectable` et `web_accessible_resources` ne sont ni comparés ni
  affichés : une mise à jour peut les élargir sans remettre l'extension inactive (limite d'ARB-144, à traiter avec l'audit EP-04, ARB-162).
- Une ancienne copie ou un dossier `.tmp` laissé par un arrêt en cours d'installation ou de mise à jour n'est pas purgé au démarrage ;
  supprimer un profil pendant un téléchargement recrée son dossier vide.
- La clé de Google n'est pas épinglée : la confiance vient de TLS, des hôtes admis et de la clé de l'extension dont l'empreinte est l'identifiant.
- Seul le format CRX3 est accepté (CRX2 refusé). La dernière version du Store est toujours prise (pas de version choisie).
- Pas de zip64 ni d'archive chiffrée : une extension hors de ces limites est refusée.
- Hors du périmètre : barre d'actions et popups (ARB-160), `nativeMessaging` (1Password reste No-Go), mises à jour des
  extensions « dossier » (sans source distante).
