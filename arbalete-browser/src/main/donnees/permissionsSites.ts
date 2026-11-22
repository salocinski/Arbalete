import type { DatabaseSync } from 'node:sqlite'
import {
  permissionSiteValide,
  PERMISSIONS_SITE,
  REPONSES_PERMISSION,
  type ChoixSite,
  type PermissionSite,
  type ReponsePermission,
  type SitePermissions
} from '../../shared/permissions.ts'
import { PROFIL_PRINCIPAL } from '../../shared/profils.ts'
import { lirePreference } from './preferences.ts'

// Choix de permission par site (ARB-15), dans la table `etat` sous `pref.permission.<hôte>.<permission>` : pas de migration.
// shortcut: une ligne par hôte et par permission, jamais purgée, et sans écran pour revenir sur un choix ; ajouter une page
// de réglages du site (et l'effacement avec les données de navigation) quand le besoin se fait sentir. Le choix suit l'hôte,
// pas l'origine (http et https d'un même site le partagent), comme le zoom (ARB-71).
const PREFIXE = 'permission.'

export function lirePermissionSite(
  db: DatabaseSync,
  hote: string,
  permission: PermissionSite
): ReponsePermission | undefined {
  const valeur = lirePreference(db, `${PREFIXE}${hote}.${permission}`)
  return REPONSES_PERMISSION.find((reponse) => reponse === valeur)
}

export function ecrirePermissionSite(
  db: DatabaseSync,
  hote: string,
  permission: PermissionSite,
  reponse: ReponsePermission
): void {
  db.prepare('INSERT OR REPLACE INTO etat (cle, valeur) VALUES (?, ?)').run(
    `pref.${PREFIXE}${hote}.${permission}`,
    reponse
  )
}

// Panneau de gestion des permissions (ARB-145). Les sites d'un profil : clé `<hôte>.<permission>` sans préfixe pour le
// profil principal, `<id>@<hôte>.<permission>` pour les autres (`hotePourProfil`). Une valeur ou une permission inconnue est
// ignorée. shortcut: balayage de toute la table `etat` à chaque ouverture du panneau ; ajouter un index si elle grossit.
export function listerPermissionsSites(db: DatabaseSync, profil: number): SitePermissions[] {
  const lignes = db.prepare('SELECT cle, valeur FROM etat WHERE cle LIKE ?').all('pref.permission.%') as {
    cle: string
    valeur: string
  }[]
  const sites = new Map<string, SitePermissions>()
  for (const { cle, valeur } of lignes) {
    const reste = cle.slice('pref.permission.'.length)
    const coupe = reste.lastIndexOf('.')
    const permission = reste.slice(coupe + 1)
    const hoteCle = reste.slice(0, coupe)
    const reponse = REPONSES_PERMISSION.find((r) => r === valeur)
    if (coupe < 1 || !reponse || !permissionSiteValide(permission)) continue
    const prefixe = /^(\d+)@(.+)$/.exec(hoteCle)
    const idProfil = prefixe ? Number(prefixe[1]) : PROFIL_PRINCIPAL
    const hote = prefixe ? prefixe[2] : hoteCle
    if (idProfil !== profil) continue
    const site = sites.get(hote) ?? { hote, choix: {} }
    site.choix[permission] = reponse
    sites.set(hote, site)
  }
  return [...sites.values()].sort((a, b) => a.hote.localeCompare(b.hote))
}

// `demander` efface le choix mémorisé (le site redemandera) ; autoriser et refuser l'écrivent.
export function definirPermissionSite(
  db: DatabaseSync,
  hoteCle: string,
  permission: PermissionSite,
  choix: ChoixSite
): void {
  if (choix === 'demander') {
    db.prepare('DELETE FROM etat WHERE cle = ?').run(`pref.${PREFIXE}${hoteCle}.${permission}`)
    return
  }
  ecrirePermissionSite(db, hoteCle, permission, choix)
}

// Efface tous les choix d'un site pour un profil : une clé exacte par permission (un motif `LIKE` effacerait aussi un
// sous-domaine, `exemple.fr.autre.camera` commençant par `exemple.fr.`).
export function reinitialiserSite(db: DatabaseSync, hoteCle: string): void {
  const effacer = db.prepare('DELETE FROM etat WHERE cle = ?')
  for (const permission of PERMISSIONS_SITE) effacer.run(`pref.${PREFIXE}${hoteCle}.${permission}`)
}
