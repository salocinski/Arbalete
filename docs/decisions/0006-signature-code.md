# 0006 — Signature du code (ARB-76)

Statut : choisi le 2026-11-16 ; câblé dans `release.yml`, à mettre en service (compte SignPath, voir plus bas).

## Contexte

L'installeur NSIS (ARB-75) et les mises à jour (ARB-77) ne sont pas signés : Windows affiche l'alerte SmartScreen, et seul le
sha512 de `latest.yml` protège une mise à jour, donc le compte GitHub qui publie. Arbalète est sous GPL-3.0-or-later, dépôt
public prévu (ARB-91).

## Décision

Signature par **SignPath Foundation** (certificat gratuit des projets open source, signature depuis GitHub Actions, aucune clé
privée à stocker). Alternatives écartées : Azure Artifact Signing (payant, éligibilité selon le pays et le statut), certificat
OV/EV commercial (200 à 500 €/an, clé sur jeton matériel ou HSM cloud, donc signature de CI plus lourde).

## Ce que ça change

- `release.yml` : build non signé, signature de `Arbalete.exe` par SignPath, installeur refait de l'application signée
  (`--prepackaged`), signature de l'installeur, contrôle `Get-AuthenticodeSignature`, puis `scripts/apres-signature.mjs` remet
  `latest.yml` d'accord (sha512, taille). Sans la variable et le secret ci-dessous, le workflow s'arrête avant de construire.
- `publish.publisherName` (`electron-builder.yml`) : écrit dans `app-update.yml`, electron-updater refuse une mise à jour dont la
  signature n'est pas celle de « SignPath Foundation ». Les installeurs publiés avant (non signés, sans cette clé) se mettent à
  jour vers le premier installeur signé ; un build local non signé ne peut plus se mettre à jour.
- Le nom d'éditeur affiché par Windows est « SignPath Foundation », pas Arbalète (propre à ce certificat).
- Chaque signature attend l'approbation d'un approbateur dans SignPath (deux par Release : application, installeur).
- Limites : l'installeur signé n'a pas de blockmap, donc chaque mise à jour se télécharge en entier (~115 Mo) ; le
  désinstalleur interne de NSIS et les DLL d'Electron ne sont pas signés par nous ; la réputation SmartScreen se construit avec
  les téléchargements, l'alerte peut rester les premiers jours.

## Mise en service (à faire par le propriétaire, je ne peux ni demander le certificat ni créer le compte)

1. Demander le certificat gratuit sur signpath.org (programme SignPath Foundation, projet open source) ; le dépôt doit être public
   et la section « Signature du code » du README en place. Les conditions exactes sont à lire sur leur site.
2. Dans SignPath : projet de slug `arbalete`, politique de signature `release-signing` (approbation manuelle), deux
   configurations d'artefact de slugs `application` et `installeur`, dont le XML est dans `.signpath/`, et le connecteur GitHub
   (« trusted build system ») du dépôt.
3. Dans GitHub (Settings → Secrets and variables → Actions) : variable `SIGNPATH_ORGANIZATION_ID`, secret `SIGNPATH_API_TOKEN`.
4. Lancer `release.yml`, approuver les deux demandes dans SignPath, puis vérifier à la main : propriétés de l'installeur
   téléchargé (onglet Signatures numériques), et une mise à jour entre deux Releases signées.

Non vérifié ici : les noms d'entrées de l'action SignPath (relus dans son `action.yml`), la forme exacte des configurations
d'artefact et le sujet du certificat (`CN=SignPath Foundation`, supposé par le contrôle de `release.yml` et par `publisherName`).
