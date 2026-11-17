# Arbalète

**Un navigateur Web libre pour Windows, pensé pour la productivité.**
Barre latérale, espaces de travail, organisation des onglets : une ergonomie inspirée d'Arc, dans un
projet communautaire sous licence GPL-3.0.

[![CI](https://github.com/salocinski/arbalete/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/salocinski/arbalete/actions/workflows/ci.yml)

> **Statut : en développement (0.12).** La navigation, les onglets, la restauration de session, l'historique et les
> thèmes Dark, Light et System fonctionnent, mais Arbalète n'est pas encore prêt pour un usage quotidien.
> Favoris, espaces de travail, téléchargements et extensions sont en cours de construction. Détails techniques :
> [README de l'application](arbalete-browser/README.md).

## Objectifs

- **Ergonomie** : barre latérale rétractable, espaces de travail avec leur couleur, palette de commandes (Ctrl+K).
- **Productivité** : organisation des onglets, onglets épinglés, raccourcis clavier fiables.
- **Fiabilité** : un vrai navigateur pour tous les jours, pas une maquette.
- **Sécurité** : les bonnes pratiques d'Electron et de Chromium appliquées dès le départ.
- **Extensions Chrome** : compatibilité visée, en cours d'évaluation.

## Démarrer

Prérequis : Windows 10/11, [Node.js LTS](https://nodejs.org) (20.19 ou 22.12 et plus, déclaré dans `engines`), Git.

```powershell
git clone https://github.com/salocinski/arbalete.git
cd arbalete\arbalete-browser
npm install
npm run dev
```

Le binaire d'Electron est téléchargé par `npm install` / `npm ci` (crochet `postinstall`, sans effet en CI). Si le
téléchargement a échoué (hors ligne), lancer `npx install-electron` : sans le binaire, `npm run dev` échoue.

| Commande | Rôle |
|---|---|
| `npm run dev` | Lancer Arbalète (Electron) |
| `npm run dev:web` | Aperçu de l'interface dans un navigateur, sur http://localhost:5180 |
| `npm run typecheck` | Vérification TypeScript des trois cibles (main et preload, interface, tests) |
| `npm run lint` | Oxlint : règles TypeScript et React hooks |
| `npm run format` / `npm run format:check` | Prettier : reformate / vérifie le formatage |
| `npm run build` | Build de production |
| `npm run dist` | Installeur Windows `release/Arbalete-Setup-<version>.exe` (NSIS, par utilisateur, non signé) |
| `npm run test:unit` | Tests unitaires (couche de données, design tokens, polices, composants de base) |
| `npm run test:smoke` | Test automatisé de l'app construite (Playwright) |

## Technologies

Electron (Chromium), React, TypeScript, Vite.

## Contribuer

Les contributions sont bienvenues : code, tests, design, documentation, signalements de bugs.
Lis le [guide de contribution](CONTRIBUTING.md) et le [code de conduite](CODE_OF_CONDUCT.md).
Pour une faille de sécurité, suis la [politique de sécurité](SECURITY.md), pas une issue publique.

## Licence

Arbalète est un logiciel libre distribué sous licence **GNU GPL v3.0 ou ultérieure** (voir [LICENSE](LICENSE)).
Vous pouvez l'utiliser, l'étudier, le modifier et le redistribuer. Toute version modifiée distribuée doit
rester sous la même licence, avec son code source.

Exceptions : le logo et les icônes (dossier `branding/` et `arbalete-browser/resources/icone.ico`) ne sont pas couverts par la GPL, voir [`branding/README.md`](branding/README.md#droits).

## Signature du code

Les installeurs publiés dans les Releases sont signés : signature de code gratuite fournie par [SignPath.io](https://signpath.io),
certificat de la [SignPath Foundation](https://signpath.org). Seuls les installeurs construits par le workflow
`.github/workflows/release.yml` à partir de `main` sont signés, après approbation d'un mainteneur.

Vie privée : Arbalète n'envoie rien de vos données à ce service. L'application installée contacte GitHub (les Releases du dépôt)
pour chercher une mise à jour, et vérifie la signature de l'installeur avant de l'installer. Détails : `docs/decisions/0006-signature-code.md`.

## Mention

Arbalète est un projet indépendant. Il n'est ni affilié, ni approuvé par The Browser Company ;
« Arc » est une marque de son propriétaire.
