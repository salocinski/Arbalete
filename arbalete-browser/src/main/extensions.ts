import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import {
  cibleNomLocalise,
  messageLocalise,
  TAILLE_MAX_MANIFEST,
  validerManifest,
  type Extension,
  type ManifestValide
} from '../shared/extensions.ts'
import { idExtensionStore, versionPlusRecente } from '../shared/webStore.ts'
import {
  ajouterExtension,
  definirExtensionActive,
  dossiersDuProfil,
  extensionDuProfil,
  extensionDuStore,
  listerExtensions,
  remplacerExtension,
  supprimerExtension
} from './donnees/extensions.ts'
import { lireCrx } from './crx.ts'
import { extraireZip } from './zip.ts'
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
  /** Télécharge le .crx d'une extension du Chrome Web Store (ARB-161) ; absent : pas d'installation depuis le Store. */
  telecharger?: (idStore: string) => Promise<Buffer>
  avertir?: (message: string, erreur: unknown) => void
}

type Profil<S, W, F> = {
  session: S
  bibliotheque: Bibliotheque<W, F> | null
  charges: Map<number, string> // id en base -> id Electron
  enErreur: Set<number>
  enCours: Set<number> // chargements en cours (un second appel, ou un double clic, ne charge pas deux fois)
}

const LIMITES = { octets: TAILLE_MAX_COPIE, fichiers: FICHIERS_MAX, profondeur: PROFONDEUR_MAX }

// Manifest d'un dossier d'extension (donc hostile) : lu, nom localisé résolu par `_locales`, puis validé.
function lireManifest(dossier: string): ManifestValide {
  const lireJson = (chemin: string): unknown => {
    if (!existsSync(chemin) || lstatSync(chemin).isSymbolicLink()) throw new Error('introuvable')
    if (lstatSync(chemin).size > TAILLE_MAX_MANIFEST) throw new Error('trop volumineux')
    const texte = readFileSync(chemin, 'utf8')
    return JSON.parse(texte.charCodeAt(0) === 0xfeff ? texte.slice(1) : texte)
  }
  let brut: unknown
  try {
    brut = lireJson(join(dossier, 'manifest.json'))
  } catch (erreur) {
    throw new Error(
      erreur instanceof Error && erreur.message === 'trop volumineux'
        ? 'manifest.json trop volumineux'
        : 'manifest.json introuvable ou illisible'
    )
  }
  const cible = cibleNomLocalise(brut)
  if (cible) {
    try {
      const nom = messageLocalise(lireJson(join(dossier, '_locales', cible.langue, 'messages.json')), cible.cle)
      if (nom) brut = { ...(brut as object), name: nom }
    } catch {
      // langue absente ou illisible : le nom s'affiche tel quel
    }
  }
  const valide = validerManifest(brut)
  if ('erreur' in valide) throw new Error(valide.erreur)
  return valide
}

// Copie sûre d'un dossier d'extension décompressé : ni lien symbolique, ni dépassement de taille, de nombre de fichiers ou de
// profondeur ; écrite dans un dossier temporaire puis renommée, donc jamais à moitié copiée.
function verifierDossier(racine: string): void {
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
  parcourir(racine, 0)
}

function copierSur(source: string, destination: string): void {
  verifierDossier(source)
  cpSync(source, destination, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true })
  // Le dossier source a pu changer entre la vérification et la copie : la copie, seule chargée ensuite, est revérifiée.
  verifierDossier(destination)
}

export function creerGestionnaireExtensions<S, W, F>(dep: Dependances<S, W, F>) {
  const profils = new Map<number, Profil<S, W, F>>()
  const avertir = dep.avertir ?? ((m, e) => console.error(m, e))
  const dossierProfil = (profil: number) => join(dep.racine, String(profil))

  function etatProfil(profil: number): Profil<S, W, F> | undefined {
    return profils.get(profil)
  }

  async function chargerUne(p: Profil<S, W, F>, profil: number, e: Extension, dossier: string) {
    if (p.charges.has(e.id) || p.enCours.has(e.id)) return
    p.enCours.add(e.id)
    try {
      const idElectron = await dep.charger(p.session, join(dossierProfil(profil), dossier))
      // Désactivée ou retirée pendant le chargement : elle ne reste pas chargée.
      if (listerExtensions(dep.db, profil).find((x) => x.id === e.id)?.actif) {
        p.charges.set(e.id, idElectron)
        p.enErreur.delete(e.id)
      } else dep.decharger(p.session, idElectron)
    } catch (erreur) {
      p.enErreur.add(e.id)
      avertir(`Extension « ${e.nom} » non chargée :`, erreur)
    } finally {
      p.enCours.delete(e.id)
    }
  }

  function dossierDe(profil: number, id: number): string | undefined {
    const ligne = dep.db.prepare('SELECT dossier FROM extension WHERE id = ? AND profil = ?').get(id, profil) as
      { dossier: string } | undefined
    return ligne?.dossier
  }

  // Remplit un dossier temporaire du profil (copie ou extraction), valide le manifest qui s'y trouve (la seule copie qui sera
  // chargée), le renomme puis passe à `inserer` ; tout échec efface le dossier. `inserer` rend null pour abandonner (le
  // dossier est alors effacé).
  function installerCopie<T>(
    profil: number,
    remplir: (temporaire: string) => void,
    inserer: (dossier: string, manifest: ManifestValide) => T | null
  ): T | null {
    const dossier = randomUUID()
    const final = join(dossierProfil(profil), dossier)
    const temporaire = final + '.tmp'
    mkdirSync(dossierProfil(profil), { recursive: true })
    try {
      remplir(temporaire)
      verifierDossier(temporaire)
      const manifest = lireManifest(temporaire)
      renameSync(temporaire, final)
      const resultat = inserer(dossier, manifest)
      if (resultat === null) rmSync(final, { recursive: true, force: true })
      return resultat
    } catch (erreur) {
      rmSync(temporaire, { recursive: true, force: true })
      rmSync(final, { recursive: true, force: true })
      throw erreur
    }
  }

  // Un téléchargement à la fois par extension du Store et par profil.
  const telechargements = new Set<string>()
  async function telechargerStore(profil: number, idStore: string): Promise<Buffer> {
    if (!dep.telecharger) throw new Error('Installation depuis le Chrome Web Store indisponible')
    const cle = `${profil}:${idStore}`
    if (telechargements.has(cle)) throw new Error('Téléchargement déjà en cours pour cette extension')
    telechargements.add(cle)
    try {
      return lireCrx(await dep.telecharger(idStore), idStore)
    } finally {
      telechargements.delete(cle)
    }
  }

  return {
    // Prépare la session d'un profil (appelée à sa création) : sans le réglage maître, rien n'est créé ni chargé. Un échec de
    // la bibliothèque laisse le navigateur fonctionner sans extensions.
    async preparer(profil: number, session: S): Promise<void> {
      if (!dep.actif() || profils.has(profil)) return
      const p: Profil<S, W, F> = {
        session,
        bibliotheque: null,
        charges: new Map(),
        enErreur: new Set(),
        enCours: new Set()
      }
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
      lireManifest(source) // refus rapide avant la copie
      return installerCopie(
        profil,
        (temporaire) => copierSur(source, temporaire),
        (dossier, manifest) => ajouterExtension(dep.db, { profil, ...manifest, dossier })
      )!
    },

    // Installe une extension du Chrome Web Store (identifiant ou lien de sa fiche), inactive : .crx téléchargé, signature
    // vérifiée, archive extraite avec les mêmes limites qu'un dossier. Renvoie l'id en base.
    async installerDepuisStore(profil: number, entree: string): Promise<number> {
      const idStore = idExtensionStore(entree)
      if (!idStore) throw new Error('Identifiant ou lien du Chrome Web Store invalide')
      if (extensionDuStore(dep.db, profil, idStore))
        throw new Error('Extension déjà installée : utilisez « Mettre à jour »')
      const zip = await telechargerStore(profil, idStore)
      return installerCopie(
        profil,
        (temporaire) => extraireZip(zip, temporaire, LIMITES),
        (dossier, manifest) => ajouterExtension(dep.db, { profil, ...manifest, dossier, storeId: idStore })
      )!
    },

    // Cherche une version plus récente d'une extension du Store (à la demande, jamais en tâche de fond). Si ses permissions
    // s'élargissent, l'extension revient inactive : l'utilisateur les relit avant de la réactiver, comme Chrome.
    async mettreAJour(profil: number, id: number): Promise<'a-jour' | 'mise-a-jour'> {
      const actuelle = extensionDuProfil(dep.db, profil, id)
      if (!actuelle?.storeId) throw new Error('Extension non installée depuis le Chrome Web Store')
      const zip = await telechargerStore(profil, actuelle.storeId)
      const maj = installerCopie(
        profil,
        (temporaire) => extraireZip(zip, temporaire, LIMITES),
        (dossier, manifest) => {
          const courante = extensionDuProfil(dep.db, profil, id) // retirée pendant le téléchargement ?
          if (!courante) throw new Error('Extension retirée pendant la mise à jour')
          if (!versionPlusRecente(manifest.version, courante.version)) return null
          const elargie = manifest.permissions.some((p) => !courante.permissions.includes(p))
          remplacerExtension(dep.db, id, { ...manifest, dossier, actif: courante.actif && !elargie })
          return { ancien: courante.dossier }
        }
      )
      if (!maj) return 'a-jour'
      const p = etatProfil(profil)
      const idElectron = p?.charges.get(id)
      if (p && idElectron) {
        try {
          dep.decharger(p.session, idElectron)
        } catch (erreur) {
          avertir('Ancienne version non déchargée :', erreur)
        }
        p.charges.delete(id)
        p.enErreur.delete(id)
      }
      try {
        rmSync(join(dossierProfil(profil), maj.ancien), { recursive: true, force: true })
      } catch (erreur) {
        avertir('Ancienne copie non effacée :', erreur)
      }
      const nouvelle = extensionDuProfil(dep.db, profil, id)
      if (p?.bibliotheque && nouvelle?.actif) {
        await chargerUne(p, profil, nouvelle, nouvelle.dossier)
        // désactivée ou retirée pendant le chargement : `definirActive` / `supprimer` n'ont rien trouvé à décharger
        if (!extensionDuProfil(dep.db, profil, id)?.actif) {
          const idElectron = p.charges.get(id)
          if (idElectron) dep.decharger(p.session, idElectron)
          p.charges.delete(id)
        }
      }
      return 'mise-a-jour'
    },

    async definirActive(profil: number, id: number, actif: boolean): Promise<void> {
      const dossier = dossierDe(profil, id)
      if (dossier === undefined) return
      const e = listerExtensions(dep.db, profil).find((x) => x.id === id)
      if (!e) return
      definirExtensionActive(dep.db, id, actif)
      const p = etatProfil(profil)
      if (!p?.bibliotheque) return // réglage maître faux ou bibliothèque absente : l'état est écrit, rien n'est chargé
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
