import type { DatabaseSync } from 'node:sqlite'
import { ETAT_BARRE_INITIAL, borneLargeurBarre } from '../../shared/barre.ts'
import { MOTEUR_DEFAUT, choixMoteurValide, type ChoixMoteur } from '../../shared/moteurs.ts'
import { isAbsolute } from 'node:path'
import { ACCUEIL_DEFAUT, CHEMIN_LONGUEUR_MAX, accueilValide, type Reglages } from '../../shared/reglages.ts'
import { enTransaction } from './transaction.ts'
import type { SidebarState, ThemeChoice } from '../../shared/types.ts'

// Préférences de l'utilisateur (ARB-59, EP-11), dans la table clé/valeur `etat` sous le préfixe `pref.` : pas de
// migration. shortcut: une valeur texte par clé, sans typage ; passer à une table dédiée si une préférence devient
// structurée (ARB-57, ARB-58).
const PREFIXE = 'pref.'

export const THEMES = ['system', 'dark', 'light'] as const satisfies readonly ThemeChoice[]

export function lirePreference(db: DatabaseSync, cle: string): string | undefined {
  const ligne = db.prepare('SELECT valeur FROM etat WHERE cle = ?').get(PREFIXE + cle) as { valeur: string } | undefined
  return ligne?.valeur
}

export function ecrirePreference(db: DatabaseSync, cle: string, valeur: string): void {
  db.prepare('INSERT OR REPLACE INTO etat (cle, valeur) VALUES (?, ?)').run(PREFIXE + cle, valeur)
}

// Thème choisi, ou « system » s'il n'a jamais été choisi ou si la valeur enregistrée est inconnue (base écrite à la main,
// thème retiré dans une version future).
export function lireTheme(db: DatabaseSync): ThemeChoice {
  const valeur = lirePreference(db, 'theme')
  return THEMES.find((theme) => theme === valeur) ?? 'system'
}

export function ecrireTheme(db: DatabaseSync, choix: ThemeChoice): void {
  ecrirePreference(db, 'theme', choix)
}

// Moteur de recherche (ARB-58) : clés `moteur` et `moteur.modele` (seulement pour « perso »). Une valeur absente, inconnue
// ou un modèle invalide redonne Google.
export function lireMoteur(db: DatabaseSync): ChoixMoteur {
  try {
    return choixMoteurValide({ id: lirePreference(db, 'moteur'), modele: lirePreference(db, 'moteur.modele') })
  } catch {
    return MOTEUR_DEFAUT
  }
}

export function ecrireMoteur(db: DatabaseSync, choix: ChoixMoteur): void {
  enTransaction(db, () => {
    ecrirePreference(db, 'moteur', choix.id)
    ecrirePreference(db, 'moteur.modele', choix.modele)
  })
}

// Réglages de la page Paramètres (ARB-57) : clés `accueil`, `animations.reduites` ('1') et `telechargements.dossier`. Une
// valeur absente ou invalide redonne le défaut (page d'accueil Google, animations actives, dossier Téléchargements).
export function lireReglages(db: DatabaseSync): Reglages {
  const dossier = lirePreference(db, 'telechargements.dossier')
  return {
    accueil: accueilValide(lirePreference(db, 'accueil')) ?? ACCUEIL_DEFAUT,
    animationsReduites: lirePreference(db, 'animations.reduites') === '1',
    dossierTelechargements: dossier && dossier.length <= CHEMIN_LONGUEUR_MAX && isAbsolute(dossier) ? dossier : null
  }
}

export function ecrireReglages(db: DatabaseSync, reglages: Reglages): void {
  enTransaction(db, () => {
    ecrirePreference(db, 'accueil', reglages.accueil)
    ecrirePreference(db, 'animations.reduites', reglages.animationsReduites ? '1' : '0')
    ecrirePreference(db, 'telechargements.dossier', reglages.dossierTelechargements ?? '')
  })
}

// Barre latérale (ARB-123) : mode (épinglée ou masquée, compacte ou étendue) et largeur étendue. Au démarrage, une barre
// épinglée est ouverte ; une valeur absente ou inconnue redonne l'état initial (masquée, 252 px).
export function lireBarre(db: DatabaseSync): SidebarState {
  const pinned = lirePreference(db, 'barre.epinglee') === '1'
  const largeur = lirePreference(db, 'barre.largeur')
  return {
    open: pinned,
    pinned,
    compact: lirePreference(db, 'barre.compacte') === '1',
    width: largeur === undefined ? ETAT_BARRE_INITIAL.width : borneLargeurBarre(Number(largeur))
  }
}

export function ecrireBarre(db: DatabaseSync, etat: SidebarState): void {
  ecrirePreference(db, 'barre.epinglee', etat.pinned ? '1' : '0')
  ecrirePreference(db, 'barre.compacte', etat.compact ? '1' : '0')
  ecrirePreference(db, 'barre.largeur', String(etat.width))
}
