import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import { ARCHIVE_GARDEE_MAX, delaiArchivageValide } from '../../shared/archivage.ts'
import {
  COULEURS_ESPACE,
  LONGUEUR_MAX_ICONE_ESPACE,
  LONGUEUR_MAX_NOM_ESPACE,
  type CouleurEspace
} from '../../shared/espaces.ts'
import { LONGUEUR_MAX_NOM_DOSSIER } from '../../shared/favoris.ts'
import { choixMoteurValide, type ChoixMoteur } from '../../shared/moteurs.ts'
import {
  permissionSiteValide,
  REPONSES_PERMISSION,
  type PermissionSite,
  type ReponsePermission
} from '../../shared/permissions.ts'
import { hotePourProfil, nomProfilValide, PROFIL_PRINCIPAL } from '../../shared/profils.ts'
import { accueilValide } from '../../shared/reglages.ts'
import { delaiVeilleValide } from '../../shared/veille.ts'
import type { BilanExport, BilanImport, ThemeChoice } from '../../shared/types.ts'
import { ajouterArchive } from './archive.ts'
import { creerEspace, lireEspaces } from './espaces.ts'
import { adresseHistorique, LONGUEUR_MAX_TITRE } from './historique.ts'
import { lirePermissionSite, ecrirePermissionSite, listerPermissionsSites } from './permissionsSites.ts'
import { THEMES, ecrirePreference, lireMoteur, lireReglages, lireTheme } from './preferences.ts'
import { insererProfil, lireProfils, definirProfilEspace } from './profils.ts'
import { enTransaction, essaiEnTransaction } from './transaction.ts'

// Export et import des données de l'utilisateur (ARB-79, EP-14, ARB-146) : favoris (dossiers compris), historique, espaces et
// réglages, dans un fichier JSON lisible ; la sauvegarde complète (version 2) y ajoute les profils, les permissions de site,
// l'archive et les onglets ouverts. Les liens entre données passent par des noms, jamais par des ids de base : le
// fichier se rejoue sur une autre installation.
// Garanties : l'export est écrit à côté puis renommé, puis relu (un fichier tronqué n'écrase jamais le précédent) ; l'import
// est additif (rien n'est supprimé ni remplacé, sauf les réglages présents dans le fichier) et tient dans une seule
// transaction (tout ou rien). Une permission déjà réglée autrement est gardée (conflit signalé), les onglets ouverts du
// fichier vont dans l'archive (aucun onglet n'est ouvert à la place de ceux de l'utilisateur). Jamais dans le fichier :
// cookies, mots de passe, stockage des sites (une session se rouvre en se reconnectant), téléchargements et dossier de
// téléchargement (propre à chaque PC).
// shortcut: l'historique garde 50 dates par page et 20 000 pages, le fichier est en clair (historique lisible par qui le
// trouve) et n'est pas chiffré ; chiffrer avec un mot de passe si la sauvegarde doit voyager hors du PC.

export const FORMAT_EXPORT = 'arbalete-donnees'
export const VERSION_EXPORT = 2
export const TAILLE_MAX_FICHIER = 50 * 1024 * 1024
const PAGES_MAX = 20000
const DATES_PAR_PAGE_MAX = 50
const FAVORIS_MAX = 20000
const ESPACES_MAX = 100
const PROFILS_MAX = 100
const PERMISSIONS_MAX = 20000
const ONGLETS_MAX = 1000
const HOTE_SITE = /^[a-z0-9._[\]:-]{1,253}$/

export interface ReglagesExportes {
  theme?: ThemeChoice
  moteur?: ChoixMoteur
  accueil?: string
  animationsReduites?: boolean
  archivageHeures?: number
  veilleMinutes?: number
}

export interface DonneesExportees {
  format: typeof FORMAT_EXPORT
  version: number
  exporteLe: number
  favoris: { dossiers: string[]; favoris: { url: string; titre: string; date: number; dossier: string | null }[] }
  historique: { url: string; titre: string; dates: number[] }[]
  // `profil` : nom du profil de l'espace, null pour le profil principal (version 2).
  espaces: { nom: string; couleur: CouleurEspace; icone: string; profil?: string | null }[]
  reglages: ReglagesExportes
  // Sauvegarde complète (version 2) : absents d'un export simple. `profils` : noms des profils autres que le principal ;
  // `profil` des permissions et `espace` des onglets : nom, null pour le profil principal / aucun espace.
  profils?: string[]
  permissions?: { profil: string | null; hote: string; permission: PermissionSite; choix: ReponsePermission }[]
  archive?: { url: string; titre: string; date: number }[]
  onglets?: { url: string; titre: string; espace: string | null }[]
}

export function construireExport(db: DatabaseSync, maintenant = Date.now(), complet = false): DonneesExportees {
  const dossiers = db.prepare('SELECT id, nom FROM dossier_favori ORDER BY id').all()
  const nomDeDossier = new Map(dossiers.map((l) => [Number(l.id), String(l.nom)]))
  const reglages = lireReglages(db)
  const datesParPage = db.prepare('SELECT date FROM visite WHERE page = ? ORDER BY date DESC LIMIT ?')
  const profils = lireProfils(db)
  const nomDeProfil = new Map(profils.map((p) => [p.id, p.nom]))
  const espaces = lireEspaces(db)
  const nomDEspace = new Map(espaces.map((e) => [e.id, e.nom]))
  const nomProfilExporte = (id: number): string | null =>
    id === PROFIL_PRINCIPAL ? null : (nomDeProfil.get(id) ?? null)
  return {
    format: FORMAT_EXPORT,
    version: VERSION_EXPORT,
    exporteLe: maintenant,
    favoris: {
      dossiers: dossiers.map((l) => String(l.nom)),
      favoris: db
        .prepare('SELECT url, titre, date, dossier FROM favori ORDER BY date, id LIMIT ?')
        .all(FAVORIS_MAX)
        .map((l) => ({
          url: String(l.url),
          titre: String(l.titre),
          date: Number(l.date),
          dossier: l.dossier === null ? null : (nomDeDossier.get(Number(l.dossier)) ?? null)
        }))
    },
    // Mêmes dates que celles que lireExport accepte, sinon la relecture d'ecrireExport diffère (horloge déréglée).
    historique: db
      .prepare('SELECT id, url, titre FROM page ORDER BY derniere_visite DESC LIMIT ?')
      .all(PAGES_MAX)
      .map((l) => ({
        url: String(l.url),
        titre: String(l.titre),
        dates: datesParPage
          .all(Number(l.id), DATES_PAR_PAGE_MAX)
          .map((v) => Number(v.date))
          .filter(dateValide)
      }))
      .filter((p) => p.dates.length > 0),
    espaces: espaces.map(({ nom, couleur, icone, profil }) => ({
      nom,
      couleur,
      icone,
      ...(complet ? { profil: nomProfilExporte(profil) } : {})
    })),
    reglages: {
      theme: lireTheme(db),
      moteur: lireMoteur(db),
      accueil: reglages.accueil,
      animationsReduites: reglages.animationsReduites,
      archivageHeures: reglages.archivageHeures,
      veilleMinutes: reglages.veilleMinutes
    },
    ...(complet
      ? {
          profils: profils.filter((p) => p.id !== PROFIL_PRINCIPAL).map((p) => p.nom),
          permissions: profils.flatMap((p) =>
            listerPermissionsSites(db, p.id).flatMap((site) =>
              Object.entries(site.choix).map(([permission, choix]) => ({
                profil: nomProfilExporte(p.id),
                hote: site.hote,
                permission: permission as PermissionSite,
                choix: choix as ReponsePermission
              }))
            )
          ),
          archive: db
            .prepare('SELECT url, titre, date FROM archive ORDER BY date DESC, id DESC LIMIT ?')
            .all(ARCHIVE_GARDEE_MAX)
            .flatMap((l) => {
              const url = adresseHistorique(String(l.url))
              return url ? [{ url, titre: String(l.titre), date: Number(l.date) }] : []
            }),
          // Session écrite par la fenêtre (une seconde après chaque changement) : les onglets ouverts à cet instant.
          onglets: db
            .prepare('SELECT url, titre, espace FROM onglet ORDER BY position LIMIT ?')
            .all(ONGLETS_MAX)
            .flatMap((l) => {
              const url = adresseHistorique(String(l.url))
              return url
                ? [
                    {
                      url,
                      titre: String(l.titre),
                      espace: l.espace === null ? null : (nomDEspace.get(Number(l.espace)) ?? null)
                    }
                  ]
                : []
            })
        }
      : {})
  }
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const tableau = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : [])
const texte = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '')
// Une date future (à un jour près) est refusée : elle placerait une page en tête des suggestions ou afficherait « Invalid Date ».
const dateValide = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v <= Date.now() + 86_400_000

// Lit et valide un fichier d'export (frontière de confiance : il vient du disque). Un fichier qui n'est pas un export
// d'Arbalète ou d'une version plus récente est refusé en entier ; une entrée invalide est ignorée, pas le reste.
export function lireExport(contenu: string): DonneesExportees {
  let brut: unknown
  try {
    brut = JSON.parse(contenu.replace(/^﻿/, ''))
  } catch {
    throw new Error('Fichier illisible : ce n’est pas un export d’Arbalète')
  }
  if (!estObjet(brut) || brut.format !== FORMAT_EXPORT) throw new Error('Ce fichier n’est pas un export d’Arbalète')
  if (typeof brut.version !== 'number' || !Number.isInteger(brut.version) || brut.version < 1)
    throw new Error('Version d’export inconnue')
  if (brut.version > VERSION_EXPORT)
    throw new Error('Export créé par une version plus récente d’Arbalète : mettez-la à jour')

  const favoris = estObjet(brut.favoris) ? brut.favoris : {}
  const dossiers = tableau(favoris.dossiers, 1000)
    .map((n) => texte(n, LONGUEUR_MAX_NOM_DOSSIER).trim())
    .filter(Boolean)
  const reglages = estObjet(brut.reglages) ? brut.reglages : {}
  const sortie: ReglagesExportes = {}
  if (THEMES.includes(reglages.theme as ThemeChoice)) sortie.theme = reglages.theme as ThemeChoice
  if (estObjet(reglages.moteur)) {
    try {
      sortie.moteur = choixMoteurValide(reglages.moteur)
    } catch {
      /* moteur inconnu : réglage laissé tel quel */
    }
  }
  const accueil = accueilValide(reglages.accueil)
  if (accueil) sortie.accueil = accueil
  if (typeof reglages.animationsReduites === 'boolean') sortie.animationsReduites = reglages.animationsReduites
  if (delaiArchivageValide(reglages.archivageHeures)) sortie.archivageHeures = reglages.archivageHeures
  if (delaiVeilleValide(reglages.veilleMinutes)) sortie.veilleMinutes = reglages.veilleMinutes

  return {
    format: FORMAT_EXPORT,
    version: brut.version,
    exporteLe: dateValide(brut.exporteLe) ? brut.exporteLe : 0,
    favoris: {
      dossiers,
      favoris: tableau(favoris.favoris, FAVORIS_MAX).flatMap((f) => {
        if (!estObjet(f)) return []
        const url = typeof f.url === 'string' ? adresseHistorique(f.url) : null
        const dossier = texte(f.dossier, LONGUEUR_MAX_NOM_DOSSIER).trim()
        return url
          ? [
              {
                url,
                titre: texte(f.titre, LONGUEUR_MAX_TITRE),
                date: dateValide(f.date) ? f.date : Date.now(),
                dossier: dossier || null
              }
            ]
          : []
      })
    },
    historique: tableau(brut.historique, PAGES_MAX).flatMap((p) => {
      if (!estObjet(p)) return []
      const url = typeof p.url === 'string' ? adresseHistorique(p.url) : null
      const dates = tableau(p.dates, DATES_PAR_PAGE_MAX).filter(dateValide)
      return url && dates.length ? [{ url, titre: texte(p.titre, LONGUEUR_MAX_TITRE), dates }] : []
    }),
    espaces: tableau(brut.espaces, ESPACES_MAX).flatMap((e) => {
      if (!estObjet(e) || !COULEURS_ESPACE.includes(e.couleur as CouleurEspace)) return []
      const nom = texte(e.nom, LONGUEUR_MAX_NOM_ESPACE + 1).trim()
      const icone = texte(e.icone, LONGUEUR_MAX_ICONE_ESPACE + 1).trim()
      if (!nom || !icone || nom.length > LONGUEUR_MAX_NOM_ESPACE || icone.length > LONGUEUR_MAX_ICONE_ESPACE) return []
      const profil = nomProfilValide(e.profil)
      return [{ nom, couleur: e.couleur as CouleurEspace, icone, ...(profil ? { profil } : {}) }]
    }),
    reglages: sortie,
    ...sectionsCompletes(brut)
  }
}

// Sections de la sauvegarde complète (version 2) : présentes seulement si le fichier les porte, chaque entrée invalide ignorée.
function sectionsCompletes(brut: Record<string, unknown>): Partial<DonneesExportees> {
  const sortie: Partial<DonneesExportees> = {}
  if (Array.isArray(brut.profils))
    sortie.profils = [...new Set(brut.profils.map((n) => nomProfilValide(n)).filter((n): n is string => !!n))].slice(
      0,
      PROFILS_MAX
    )
  if (Array.isArray(brut.permissions))
    sortie.permissions = brut.permissions.slice(0, PERMISSIONS_MAX).flatMap((p) => {
      if (!estObjet(p) || typeof p.hote !== 'string' || !HOTE_SITE.test(p.hote)) return []
      if (!permissionSiteValide(p.permission) || !REPONSES_PERMISSION.includes(p.choix as ReponsePermission)) return []
      const profil = p.profil === null || p.profil === undefined ? null : (nomProfilValide(p.profil) ?? '')
      return profil === ''
        ? []
        : [{ profil, hote: p.hote, permission: p.permission, choix: p.choix as ReponsePermission }]
    })
  if (Array.isArray(brut.archive))
    sortie.archive = brut.archive.slice(0, ARCHIVE_GARDEE_MAX).flatMap((a) => {
      const url = estObjet(a) && typeof a.url === 'string' ? adresseHistorique(a.url) : null
      return url && estObjet(a) && dateValide(a.date)
        ? [{ url, titre: texte(a.titre, LONGUEUR_MAX_TITRE), date: a.date }]
        : []
    })
  if (Array.isArray(brut.onglets))
    sortie.onglets = brut.onglets.slice(0, ONGLETS_MAX).flatMap((o) => {
      const url = estObjet(o) && typeof o.url === 'string' ? adresseHistorique(o.url) : null
      if (!url || !estObjet(o)) return []
      return [
        { url, titre: texte(o.titre, LONGUEUR_MAX_TITRE), espace: texte(o.espace, LONGUEUR_MAX_NOM_ESPACE) || null }
      ]
    })
  return sortie
}

// Ajoute à la base ce que l'export contient et qu'elle n'a pas encore ; tout ou rien. Un favori déjà présent (même adresse)
// est gardé tel quel, un dossier du même nom réutilisé, une page déjà connue reçoit les visites manquantes (même date =
// même visite : rejouer un import ne change rien), un espace du même nom est ignoré. Les réglages présents dans le fichier
// remplacent les actuels ; le dossier de téléchargement n'est jamais touché. ARB-146 : un profil du même nom est réutilisé,
// une permission déjà réglée est gardée (comptée dans `conflits` si elle diffère), l'archive et les onglets du fichier
// s'ajoutent à l'archive (même adresse et même date = déjà là). `essai` : même calcul, annulé, pour l'aperçu.
export function importerExport(db: DatabaseSync, donnees: DonneesExportees, essai = false): BilanImport {
  return (essai ? essaiEnTransaction : enTransaction)(db, () => {
    const dossiers = new Map(
      db
        .prepare('SELECT nom, id FROM dossier_favori ORDER BY id DESC')
        .all()
        .map((l) => [String(l.nom), Number(l.id)])
    )
    const idDossier = (nom: string): number => {
      let id = dossiers.get(nom)
      if (id === undefined) {
        id = Number(db.prepare('INSERT INTO dossier_favori (nom) VALUES (?)').run(nom).lastInsertRowid)
        dossiers.set(nom, id)
      }
      return id
    }
    for (const nom of donnees.favoris.dossiers) idDossier(nom)
    const ajouterFavori = db.prepare('INSERT OR IGNORE INTO favori (url, titre, date, dossier) VALUES (?, ?, ?, ?)')
    let favoris = 0
    for (const f of donnees.favoris.favoris)
      favoris += Number(
        ajouterFavori.run(f.url, f.titre, f.date, f.dossier === null ? null : idDossier(f.dossier)).changes
      )

    const ajouterPage = db.prepare(`INSERT INTO page (url, titre, visites, derniere_visite) VALUES (?, ?, 0, 0)
      ON CONFLICT (url) DO UPDATE SET titre = CASE WHEN titre = '' THEN excluded.titre ELSE titre END RETURNING id`)
    const existe = db.prepare('SELECT 1 FROM visite WHERE page = ? AND date = ?')
    const ajouterVisite = db.prepare('INSERT INTO visite (page, date) VALUES (?, ?)')
    const recompter = db.prepare(`UPDATE page SET visites = (SELECT COUNT(*) FROM visite WHERE page = page.id),
      derniere_visite = (SELECT MAX(date) FROM visite WHERE page = page.id) WHERE id = ?`)
    let pages = 0
    for (const p of donnees.historique) {
      const { id } = ajouterPage.get(p.url, p.titre) as { id: number }
      let nouvelles = 0
      for (const date of new Set(p.dates))
        if (!existe.get(id, date)) {
          ajouterVisite.run(id, date)
          nouvelles++
        }
      recompter.run(id)
      if (nouvelles) pages++
    }

    const idProfils = new Map(lireProfils(db).map((p) => [p.nom, p.id]))
    let profils = 0
    for (const nom of donnees.profils ?? [])
      if (!idProfils.has(nom)) {
        idProfils.set(nom, insererProfil(db, nom))
        profils++
      }

    const noms = new Set(lireEspaces(db).map((e) => e.nom))
    let espaces = 0
    for (const e of donnees.espaces)
      if (!noms.has(e.nom)) {
        const id = creerEspace(db, e)
        const profil = e.profil ? idProfils.get(e.profil) : undefined
        if (profil !== undefined) definirProfilEspace(db, id, profil)
        noms.add(e.nom)
        espaces++
      }

    let permissions = 0
    let conflits = 0
    for (const p of donnees.permissions ?? []) {
      const profil = p.profil === null ? PROFIL_PRINCIPAL : idProfils.get(p.profil)
      if (profil === undefined) continue
      const hote = hotePourProfil(p.hote, profil)
      // Un fichier venu d'ailleurs ne pré-accorde rien : seuls les refus s'importent, une autorisation se redemande.
      if (p.choix !== 'refuser') continue
      const actuel = lirePermissionSite(db, hote, p.permission)
      if (actuel === undefined) {
        ecrirePermissionSite(db, hote, p.permission, p.choix)
        permissions++
      } else if (actuel !== p.choix) conflits++
    }

    const idEspaces = new Map(lireEspaces(db).map((e) => [e.nom, e.id]))
    const existeArchive = db.prepare('SELECT 1 FROM archive WHERE url = ? AND date = ?')
    const aArchiver = [
      ...(donnees.archive ?? []).map((a) => ({ ...a, espace: null as number | null })),
      ...(donnees.onglets ?? []).map((o) => ({
        url: o.url,
        titre: o.titre,
        date: donnees.exporteLe || Date.now(),
        espace: o.espace === null ? null : (idEspaces.get(o.espace) ?? null)
      }))
    ].filter(
      (a, i, tout) =>
        !existeArchive.get(a.url, a.date) && tout.findIndex((b) => b.url === a.url && b.date === a.date) === i
    )
    // Le plafond de l'archive ne chasse jamais l'archive existante : l'import n'utilise que la place restante.
    const place = Math.max(0, ARCHIVE_GARDEE_MAX - Number(db.prepare('SELECT COUNT(*) AS n FROM archive').get()!.n))
    aArchiver.splice(place)
    ajouterArchive(db, aArchiver)

    const r = donnees.reglages
    const ecrire: [string, string | undefined][] = [
      ['theme', r.theme],
      ['moteur', r.moteur?.id],
      ['moteur.modele', r.moteur?.modele],
      ['accueil', r.accueil],
      ['animations.reduites', r.animationsReduites === undefined ? undefined : r.animationsReduites ? '1' : '0'],
      ['archivage.heures', r.archivageHeures === undefined ? undefined : String(r.archivageHeures)],
      ['veille.minutes', r.veilleMinutes === undefined ? undefined : String(r.veilleMinutes)]
    ]
    const presents = ecrire.filter((e): e is [string, string] => e[1] !== undefined)
    presents.forEach(([cle, valeur]) => ecrirePreference(db, cle, valeur))
    return {
      favoris,
      pages,
      espaces,
      profils,
      permissions,
      archive: aArchiver.length,
      conflits,
      reglages: presents.length > 0
    }
  })
}

// Écrit l'export à côté du fichier visé, le relit et le valide, puis le renomme : un disque plein ou un arrêt en cours de
// route laisse l'ancien fichier intact. Renvoie ce qui a été relu.
export function ecrireExport(chemin: string, donnees: DonneesExportees): BilanExport {
  // Nom unique et création exclusive : ne jamais écraser ni supprimer un fichier de l'utilisateur.
  const provisoire = `${chemin}.${process.pid}-${Date.now()}.tmp`
  try {
    writeFileSync(provisoire, JSON.stringify(donnees, null, 2), { encoding: 'utf8', flag: 'wx' })
    const relu = lireExport(readFileSync(provisoire, 'utf8'))
    if (
      relu.favoris.favoris.length !== donnees.favoris.favoris.length ||
      relu.historique.length !== donnees.historique.length ||
      (relu.permissions?.length ?? 0) !== (donnees.permissions?.length ?? 0) ||
      (relu.archive?.length ?? 0) + (relu.onglets?.length ?? 0) !==
        (donnees.archive?.length ?? 0) + (donnees.onglets?.length ?? 0)
    ) {
      throw new Error('Export incomplet : le fichier relu diffère de la base')
    }
    renameSync(provisoire, chemin)
    return {
      favoris: relu.favoris.favoris.length,
      pages: relu.historique.length,
      profils: relu.profils?.length ?? 0,
      permissions: relu.permissions?.length ?? 0,
      archive: (relu.archive?.length ?? 0) + (relu.onglets?.length ?? 0)
    }
  } catch (erreur) {
    rmSync(provisoire, { force: true })
    throw erreur
  }
}
