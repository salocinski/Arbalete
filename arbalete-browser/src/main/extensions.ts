import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { TAILLE_MAX_MANIFEST, validerManifest, type Extension } from '../shared/extensions.ts'
import {
  ajouterExtension,
  definirExtensionActive,
  dossiersDuProfil,
  listerExtensions,
  supprimerExtension
} from './donnees/extensions.ts'
import { enTransaction } from './donnees/transaction.ts'

// Gestionnaire des extensions Chrome (ARB-144, EP-04, décision 0004). Une bibliothèque (electron-chrome-extensions) par
// session de profil, créée seulement quand le réglage « Extensions » est vrai ; tout ce qui touche Electron est injecté
// (faux dans extensions.test.ts), comme miseAJour.ts et gestionnaireTelechargements.ts.

export const TAILLE_MAX_COPIE = 100 * 1024 * 1024
export const FICHIERS_MAX = 5000
export const PROFONDEUR_MAX = 12

// Ce que le gestionnaire demande à la bibliothèque et à la session (un WebContents / BaseWindow Electron en vrai).
export type Bibliotheque<W = unknown, F = unknown> = {
  addTab(contenu: W, fenetre: F): void
  selectTab(contenu: W): void
  removeTab(contenu: W): void
}

export type Dependances<S = unknown, W = unknown, F = unknown> = {
  db: DatabaseSync
  racine: string // <userData>/extensions
  actif: () => boolean // réglage maître `pref.extensions.actif`
  creerBibliotheque: (session: S) => Bibliotheque<W, F>
  charger: (session: S, chemin: string) => Promise<string> // renvoie l'id Electron de l'extension
  decharger: (session: S, idElectron: string) => void
  avertir?: (message: string, erreur: unknown) => void
}

type Profil<S, W, F> = {
  session: S
  bibliotheque: Bibliotheque<W, F> | null
  charges: Map<number, string> // id en base -> id Electron
  enErreur: Set<number>
}

// Copie sûre d'un dossier d'extension décompressé : ni lien symbolique, ni dépassement de taille, de nombre de fichiers ou de
// profondeur ; écrite dans un dossier temporaire puis renommée, donc jamais à moitié copiée.
function copierSur(source: string, destination: string): void {
  let octets = 0
  let fichiers = 0
  const parcourir = (dossier: string, profondeur: number) => {
    if (profondeur > PROFONDEUR_MAX) throw new Error('Dossier trop profond')
    for (const nom of readdirSync(dossier)) {
      const chemin = join(dossier, nom)
      const info = lstatSync(chemin)
      if (info.isSymbolicLink()) throw new Error('Lien symbolique refusé')
      if (info.isDirectory()) parcourir(chemin, profondeur + 1)
      else if (info.isFile()) {
        octets += info.size
        if (++fichiers > FICHIERS_MAX || octets > TAILLE_MAX_COPIE) throw new Error('Extension trop volumineuse')
      } else throw new Error('Fichier spécial refusé')
    }
  }
  parcourir(source, 0)
  // verbatimSymlinks : un lien apparu entre la vérification et la copie ne serait pas suivi.
  cpSync(source, destination, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true })
}

export function creerGestionnaireExtensions<S, W, F>(dep: Dependances<S, W, F>) {
  const profils = new Map<number, Profil<S, W, F>>()
  const avertir = dep.avertir ?? ((m, e) => console.error(m, e))
  const dossierProfil = (profil: number) => join(dep.racine, String(profil))

  function etatProfil(profil: number): Profil<S, W, F> | undefined {
    return profils.get(profil)
  }

  async function chargerUne(p: Profil<S, W, F>, profil: number, e: Extension, dossier: string) {
    try {
      p.charges.set(e.id, await dep.charger(p.session, join(dossierProfil(profil), dossier)))
      p.enErreur.delete(e.id)
    } catch (erreur) {
      p.enErreur.add(e.id)
      avertir(`Extension « ${e.nom} » non chargée :`, erreur)
    }
  }

  function dossierDe(profil: number, id: number): string | undefined {
    const ligne = dep.db.prepare('SELECT dossier FROM extension WHERE id = ? AND profil = ?').get(id, profil) as
      { dossier: string } | undefined
    return ligne?.dossier
  }

  return {
    // Prépare la session d'un profil (appelée à sa création) : sans le réglage maître, rien n'est créé ni chargé. Un échec de
    // la bibliothèque laisse le navigateur fonctionner sans extensions.
    async preparer(profil: number, session: S): Promise<void> {
      if (!dep.actif() || profils.has(profil)) return
      const p: Profil<S, W, F> = { session, bibliotheque: null, charges: new Map(), enErreur: new Set() }
      profils.set(profil, p)
      try {
        p.bibliotheque = dep.creerBibliotheque(session)
      } catch (erreur) {
        avertir('Extensions indisponibles :', erreur)
        return
      }
      for (const e of listerExtensions(dep.db, profil)) {
        const dossier = dossierDe(profil, e.id)
        if (e.actif && dossier) await chargerUne(p, profil, e, dossier)
      }
    },

    // Liste du profil, l'état « en erreur » en plus.
    lister(profil: number): Extension[] {
      const p = etatProfil(profil)
      return listerExtensions(dep.db, profil).map((e) =>
        e.actif && p?.enErreur.has(e.id) ? { ...e, erreur: true } : e
      )
    },

    // Copie le dossier choisi dans le profil, valide son manifest et l'enregistre, inactive. Le dossier source vient d'une
    // boîte système, jamais de l'interface. Renvoie l'id en base.
    installer(profil: number, source: string): number {
      const manifest = join(source, 'manifest.json')
      if (!existsSync(manifest) || lstatSync(manifest).isSymbolicLink()) throw new Error('manifest.json introuvable')
      if (lstatSync(manifest).size > TAILLE_MAX_MANIFEST) throw new Error('manifest.json trop volumineux')
      const valide = validerManifest(JSON.parse(readFileSync(manifest, 'utf8')))
      if ('erreur' in valide) throw new Error(valide.erreur)
      const dossier = randomUUID()
      const final = join(dossierProfil(profil), dossier)
      const temporaire = final + '.tmp'
      mkdirSync(dossierProfil(profil), { recursive: true })
      try {
        copierSur(source, temporaire)
        renameSync(temporaire, final)
        return ajouterExtension(dep.db, { profil, ...valide, dossier })
      } catch (erreur) {
        rmSync(temporaire, { recursive: true, force: true })
        rmSync(final, { recursive: true, force: true })
        throw erreur
      }
    },

    async definirActive(profil: number, id: number, actif: boolean): Promise<void> {
      const dossier = dossierDe(profil, id)
      if (dossier === undefined) return
      const e = listerExtensions(dep.db, profil).find((x) => x.id === id)
      if (!e) return
      definirExtensionActive(dep.db, id, actif)
      const p = etatProfil(profil)
      if (!p) return // réglage maître faux : l'état est écrit, rien n'est chargé
      if (actif) await chargerUne(p, profil, { ...e, actif }, dossier)
      else {
        const idElectron = p.charges.get(id)
        if (idElectron) dep.decharger(p.session, idElectron)
        p.charges.delete(id)
        p.enErreur.delete(id)
      }
    },

    // Retire l'extension : déchargée, ligne supprimée, copie effacée.
    supprimer(profil: number, id: number): void {
      if (dossierDe(profil, id) === undefined) return
      const p = etatProfil(profil)
      const idElectron = p?.charges.get(id)
      if (p && idElectron) dep.decharger(p.session, idElectron)
      p?.charges.delete(id)
      p?.enErreur.delete(id)
      const retiree = enTransaction(dep.db, () => supprimerExtension(dep.db, id))
      if (retiree) rmSync(join(dossierProfil(profil), retiree.dossier), { recursive: true, force: true })
    },

    // Copies d'un profil, à relever avant sa suppression (la cascade en retire les lignes) puis à passer à `effacerProfil`.
    copies(profil: number): string[] {
      return dossiersDuProfil(dep.db, profil)
    },

    // Décharge les extensions d'un profil supprimé et efface ses copies.
    effacerProfil(profil: number, dossiers: string[]): void {
      const p = etatProfil(profil)
      for (const idElectron of p?.charges.values() ?? []) dep.decharger(p!.session, idElectron)
      profils.delete(profil)
      for (const d of dossiers) rmSync(join(dossierProfil(profil), d), { recursive: true, force: true })
    },

    // Suivi des onglets par la bibliothèque du profil (sans bibliothèque : sans effet).
    ajouterOnglet(profil: number, contenu: W, fenetre: F): void {
      etatProfil(profil)?.bibliotheque?.addTab(contenu, fenetre)
    },
    selectionnerOnglet(profil: number, contenu: W): void {
      etatProfil(profil)?.bibliotheque?.selectTab(contenu)
    },
    retirerOnglet(profil: number, contenu: W): void {
      etatProfil(profil)?.bibliotheque?.removeTab(contenu)
    }
  }
}

export type GestionnaireExtensions = ReturnType<typeof creerGestionnaireExtensions>
