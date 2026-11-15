import { ETAT_BARRE_INITIAL, borneLargeurBarre, transitionBarre } from '../../shared/barre'
import { COULEURS_ESPACE, ESPACES_INITIAUX, LONGUEUR_MAX_NOM_ESPACE, champsNouvelEspace, ordreApresDeplacement, type CouleurEspace, type Espace } from '../../shared/espaces'
import { MOTEUR_DEFAUT, modeleDe, urlRecherche, type ChoixMoteur } from '../../shared/moteurs'
import { REGLAGES_DEFAUT, accueilValide, type Reglages } from '../../shared/reglages'
import { delaiArchivageValide, type ElementArchive } from '../../shared/archivage'
import { delaiVeilleValide } from '../../shared/veille'
import { estActif, type Telechargement } from '../../shared/telechargements'
import type { BrowserAPI, BrowserState, BrowserTab, SidebarState, ThemeChoice } from '../../shared/types'

/**
 * Mode aperçu navigateur.
 *
 * Hors d'Electron (npm run dev:web), le preload n'existe pas et `window.arbalete`
 * est absent. On installe alors une API simulée, en mémoire, pour que l'interface
 * soit utilisable dans un navigateur classique : c'est ce qui permet aux skills
 * gstack (/qa, /design-review, /browse, /benchmark) de tester l'UI.
 *
 * Aucune page web n'est réellement chargée : la zone de contenu affiche un
 * cadre de remplacement. Ce module n'est jamais actif dans l'application Electron.
 */

import { ongletsAFermer } from '../../shared/menuOnglet'
import { fusionnerOrdre, ordreApresDeplacementOnglet } from '../../shared/ordreOnglets'
import { nomDossierOngletValide, type DossierOnglet } from '../../shared/dossiersOnglets'
type PreviewTab = BrowserTab & { history: string[]; index: number }

let previewMode = false

export function isPreviewMode(): boolean {
  return previewMode
}

function titleFor(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return host.charAt(0).toUpperCase() + host.slice(1)
  } catch {
    return 'Nouvel onglet'
  }
}

let moteur: ChoixMoteur = MOTEUR_DEFAUT

function normalizeUrl(input: string): string {
  const value = input.trim()
  if (!value) return 'https://www.google.com'
  if (/^https?:\/\//i.test(value)) return value
  if (!value.includes(' ') && value.includes('.')) return `https://${value}`
  return urlRecherche(modeleDe(moteur), value)
}

export function installPreviewApi(): boolean {
  if (typeof window === 'undefined' || window.arbalete) return false
  previewMode = true

  const tabs: PreviewTab[] = []
  let activeTabId: string | null = null
  let next = 1
  const stateListeners = new Set<(state: BrowserState) => void>()
  const themeListeners = new Set<(theme: 'dark' | 'light') => void>()
  let sidebar: SidebarState = { ...ETAT_BARRE_INITIAL }
  const sidebarListeners = new Set<(state: SidebarState) => void>()
  const setSidebarState = (next: SidebarState) => {
    if (next.open === sidebar.open && next.pinned === sidebar.pinned && next.compact === sidebar.compact && next.width === sidebar.width) return
    sidebar = next
    sidebarListeners.forEach((fn) => fn({ ...sidebar }))
  }
  // Dans l'aperçu, la barre est dans le même document que la page simulée : l'overlay n'a rien à agrandir.
  let overlay = false
  const overlayListeners = new Set<(open: boolean) => void>()
  // Téléchargements de l'aperçu (ARB-55) : un en cours qui avance seul, un terminé et un interrompu, en mémoire.
  const MO = 1024 * 1024
  let downloads: Telechargement[] = [
    { id: 3, url: 'https://example.com/archive-100-mo.zip', nom: 'archive-100-mo.zip', chemin: 'C:\\Téléchargements\\archive-100-mo.zip', total: 100 * MO, recu: 12 * MO, etat: 'en-cours', date: Date.now() },
    { id: 2, url: 'https://example.com/rapport.pdf', nom: 'rapport.pdf', chemin: 'C:\\Téléchargements\\rapport.pdf', total: 2 * MO, recu: 2 * MO, etat: 'termine', date: Date.now() - 60_000 },
    { id: 1, url: 'https://example.com/video.mp4', nom: 'video.mp4', chemin: 'C:\\Téléchargements\\video.mp4', total: 0, recu: 30 * MO, etat: 'interrompu', date: Date.now() - 120_000 }
  ]
  const downloadListeners = new Set<(list: Telechargement[]) => void>()
  const setDownload = (id: number, champs: Partial<Telechargement>) => {
    downloads = downloads.map((item) => (item.id === id ? { ...item, ...champs } : item))
    downloadListeners.forEach((fn) => fn(downloads))
  }
  setInterval(() => {
    const item = downloads.find((candidate) => candidate.etat === 'en-cours')
    if (!item) return
    const recu = Math.min(item.total, item.recu + 2 * MO)
    setDownload(item.id, { recu, etat: recu >= item.total ? 'termine' : 'en-cours' })
  }, 500)
  let theme: ThemeChoice = 'system'
  let reglages: Reglages = { ...REGLAGES_DEFAUT }
  const reglagesListeners = new Set<(reglages: Reglages) => void>()
  const changerReglages = (suivants: Reglages) => {
    reglages = suivants
    reglagesListeners.forEach((fn) => fn({ ...reglages }))
  }
  const themeChoiceListeners = new Set<(choice: ThemeChoice) => void>()
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const systemTheme = (): 'dark' | 'light' => (media.matches ? 'dark' : 'light')
  media.addEventListener('change', () => themeListeners.forEach((fn) => fn(systemTheme())))

  // Espaces de l'aperçu (ARB-61) : les trois d'origine, en mémoire ; chaque onglet appartient à l'un d'eux et chaque espace
  // garde son onglet actif.
  const workspaces: Espace[] = ESPACES_INITIAUX.map((champs, index) => ({ id: index + 1, ...champs }))
  let nextWorkspaceId = workspaces.length + 1
  let activeWorkspaceId = workspaces[0].id
  const lastActive = new Map<number, string>()
  const spaceOf = new Map<string, number>()
  // Les épinglés d'abord (ARB-64), comme dans le processus principal.
  const visible = () => {
    const ici = tabs.filter((tab) => spaceOf.get(tab.id) === activeWorkspaceId)
    return [...ici.filter((tab) => tab.pinned), ...ici.filter((tab) => !tab.pinned)]
  }
  // Archive de l'aperçu (ARB-64) : deux éléments d'exemple, sans archivage automatique (pas de minuterie d'onglets).
  let archive: ElementArchive[] = [
    { id: 1, url: 'https://example.com/', titre: 'Exemple', date: Date.now() - 3_600_000 },
    { id: 2, url: 'https://fr.wikipedia.org/', titre: 'Wikipédia', date: Date.now() - 86_400_000 }
  ]
  // Dossiers d'onglets de l'aperçu (ARB-69) : en mémoire, chacun dans l'espace où il a été créé.
  const folders: (DossierOnglet & { espace: number })[] = []
  let nextFolderId = 1
  // Favoris de l'aperçu (ARB-47) : en mémoire, perdus au rechargement de la page.
  const favorites = new Set<string>()
  const snapshot = (): BrowserState => ({
    tabs: visible().map(({ history: _h, index: _i, ...tab }) => ({ ...tab })),
    activeTabId,
    workspaces: [...workspaces],
    activeWorkspaceId,
    favorite: favorites.has(active()?.url ?? ''),
    favorites: [...favorites].slice(0, 8).map((url) => ({ url, title: titleFor(url) })),
    popupsBloquees: 0,
    folders: folders.filter((dossier) => dossier.espace === activeWorkspaceId).map(({ id, nom, replie }) => ({ id, nom, replie }))
  })
  const emit = () => {
    const state = snapshot()
    stateListeners.forEach((fn) => fn(state))
  }
  const active = () => tabs.find((tab) => tab.id === activeTabId)
  const sync = (tab: PreviewTab) => {
    tab.url = tab.history[tab.index]
    tab.title = titleFor(tab.url)
    tab.canGoBack = tab.index > 0
    tab.canGoForward = tab.index < tab.history.length - 1
    tab.isLoading = true
    emit()
    window.setTimeout(() => {
      tab.isLoading = false
      emit()
    }, 350)
  }

  const createTab = (url = 'https://www.google.com') => {
    const id = `tab-${next++}`
    const normalized = normalizeUrl(url)
    tabs.push({ id, title: titleFor(normalized), url: normalized, isLoading: false, canGoBack: false, canGoForward: false, history: [normalized], index: 0 })
    spaceOf.set(id, activeWorkspaceId)
    activeTabId = id
    sync(tabs[tabs.length - 1])
    return id
  }

  const api: BrowserAPI = {
    getState: async () => snapshot(),
    toggleFavorite: async () => {
      const url = active()?.url
      if (!url || !/^https?:/i.test(url)) return
      if (!favorites.delete(url)) favorites.add(url)
      emit()
    },
    openFavorite: async (url) => {
      if (!favorites.has(url)) return
      const ouvert = visible().find((tab) => tab.url === url)
      if (ouvert) {
        activeTabId = ouvert.id
        emit()
      } else createTab(url)
    },
    setWorkspace: async (id) => {
      if (id === activeWorkspaceId || !workspaces.some((space) => space.id === id)) return
      if (activeTabId) lastActive.set(activeWorkspaceId, activeTabId)
      activeWorkspaceId = id
      const remembered = lastActive.get(id)
      const target = remembered && spaceOf.get(remembered) === id ? remembered : visible().at(-1)?.id
      if (target) {
        activeTabId = target
        emit()
      } else createTab()
    },
    createWorkspace: async (name) => {
      const nom = name.trim()
      if (!nom || nom.length > LONGUEUR_MAX_NOM_ESPACE) throw new Error('Nom d’espace invalide')
      const space = { id: nextWorkspaceId++, ...champsNouvelEspace(workspaces, nom) }
      workspaces.push(space)
      await api.setWorkspace(space.id)
    },
    renameWorkspace: async (id, name) => {
      const nom = name.trim()
      if (!nom || nom.length > LONGUEUR_MAX_NOM_ESPACE) throw new Error('Nom d’espace invalide')
      const space = workspaces.find((item) => item.id === id)
      if (!space) return
      space.nom = nom
      emit()
    },
    setWorkspaceColor: async (id, color) => {
      if (!(COULEURS_ESPACE as readonly string[]).includes(color)) throw new Error('Couleur d’espace inconnue')
      const space = workspaces.find((item) => item.id === id)
      if (!space) return
      space.couleur = color as CouleurEspace
      emit()
    },
    moveWorkspace: async (id, direction) => {
      const ordre = ordreApresDeplacement(workspaces.map((item) => item.id), id, direction)
      workspaces.sort((a, b) => ordre.indexOf(a.id) - ordre.indexOf(b.id))
      emit()
    },
    deleteWorkspace: async (id) => {
      const index = workspaces.findIndex((item) => item.id === id)
      if (index < 0 || workspaces.length < 2) return
      if (id === activeWorkspaceId) await api.setWorkspace((workspaces[index + 1] ?? workspaces[index - 1]).id)
      workspaces.splice(index, 1)
      lastActive.delete(id)
      for (const tab of tabs.filter((item) => spaceOf.get(item.id) === id)) {
        tabs.splice(tabs.indexOf(tab), 1)
        spaceOf.delete(tab.id)
      }
      emit()
    },
    createTab: async (url) => createTab(url),
    closeTab: async (id) => {
      const index = tabs.findIndex((tab) => tab.id === id)
      if (index === -1) return
      const before = visible().map((tab) => tab.id)
      tabs.splice(index, 1)
      spaceOf.delete(id)
      if (activeTabId === id) {
        const left = before.filter((other) => other !== id)
        activeTabId = left[Math.min(before.indexOf(id), left.length - 1)] ?? null
      }
      if (!visible().length) createTab()
      else emit()
    },
    tabAction: async (id, action) => {
      const tab = tabs.find((item) => item.id === id)
      if (!tab) return
      if (action === 'dupliquer') createTab(tab.url)
      else if (action === 'copier-adresse') await navigator.clipboard?.writeText(tab.url).catch(() => {})
      else if (action === 'epingler') { tab.pinned = !tab.pinned; if (tab.pinned) delete tab.folder; emit() }
      else {
        for (const autre of ongletsAFermer(visible(), id)) {
          tabs.splice(tabs.findIndex((item) => item.id === autre), 1)
          spaceOf.delete(autre)
        }
        activeTabId = id
        emit()
      }
    },
    moveTab: async (id, index) => {
      const ordre = ordreApresDeplacementOnglet(visible().map((tab) => tab.id), id, index)
      const nouveaux = fusionnerOrdre(tabs.map((tab) => tab.id), visible().map((tab) => tab.id), ordre)
      tabs.sort((a, b) => nouveaux.indexOf(a.id) - nouveaux.indexOf(b.id))
      emit()
    },
    createTabFolder: async () => {
      const dossier = { id: nextFolderId++, nom: 'Nouveau dossier', replie: false, espace: activeWorkspaceId }
      folders.push(dossier)
      emit()
      return dossier.id
    },
    renameTabFolder: async (id, nom) => {
      const propre = nomDossierOngletValide(nom)
      const dossier = folders.find((item) => item.id === id && item.espace === activeWorkspaceId)
      if (propre === null) throw new Error('Nom de dossier invalide')
      if (dossier) { dossier.nom = propre; emit() }
    },
    toggleTabFolder: async (id) => {
      const dossier = folders.find((item) => item.id === id && item.espace === activeWorkspaceId)
      if (dossier) { dossier.replie = !dossier.replie; emit() }
    },
    deleteTabFolder: async (id) => {
      const index = folders.findIndex((item) => item.id === id && item.espace === activeWorkspaceId)
      if (index < 0) return
      folders.splice(index, 1)
      for (const tab of tabs) if (tab.folder === id) delete tab.folder
      emit()
    },
    setTabFolder: async (tabId, dossier) => {
      const tab = tabs.find((item) => item.id === tabId)
      if (!tab) return
      if (dossier === null) delete tab.folder
      else if (!tab.pinned && folders.some((item) => item.id === dossier && item.espace === spaceOf.get(tabId))) tab.folder = dossier
      else return
      emit()
    },
    activateTab: async (id) => {
      if (!visible().some((tab) => tab.id === id)) return
      activeTabId = id
      emit()
    },
    navigate: async (url) => {
      const tab = active()
      if (!tab) return
      tab.history = tab.history.slice(0, tab.index + 1)
      tab.history.push(normalizeUrl(url))
      tab.index = tab.history.length - 1
      sync(tab)
    },
    goBack: async () => {
      const tab = active()
      if (tab && tab.index > 0) { tab.index--; sync(tab) }
    },
    goForward: async () => {
      const tab = active()
      if (tab && tab.index < tab.history.length - 1) { tab.index++; sync(tab) }
    },
    reload: async () => {
      const tab = active()
      if (tab) sync(tab)
    },
    setContentBounds: () => {},
    getSystemTheme: async () => systemTheme(),
    onSystemTheme: (callback) => {
      themeListeners.add(callback)
      return () => themeListeners.delete(callback)
    },
    onState: (callback) => {
      stateListeners.add(callback)
      return () => stateListeners.delete(callback)
    },
    // Mêmes transitions que agirSurBarre dans le processus principal (shared/barre.ts).
    getSidebar: async () => ({ ...sidebar }),
    setSidebar: async (action) => setSidebarState(transitionBarre(sidebar, action)),
    setSidebarWidth: async (width) => setSidebarState({ ...sidebar, width: borneLargeurBarre(width) }),
    onSidebar: (callback) => {
      sidebarListeners.add(callback)
      return () => sidebarListeners.delete(callback)
    },
    getOverlay: async () => overlay,
    setOverlay: async (open) => {
      if (open === overlay) return
      overlay = open
      overlayListeners.forEach((fn) => fn(overlay))
    },
    onOverlay: (callback) => {
      overlayListeners.add(callback)
      return () => overlayListeners.delete(callback)
    },
    // Pas de suggestions dans l'aperçu : elles s'affichent dans la vue de la barre, absente ici (ARB-53).
    suggest: async () => undefined,
    moveSuggestion: async () => undefined,
    chooseSuggestion: async () => false,
    closeSuggestions: async () => undefined,
    getSuggestions: async () => null,
    onSuggestions: () => () => undefined,
    // Pas d'invite de permission dans l'aperçu : les pages n'y sont pas réelles (ARB-15).
    getPermissionRequest: async () => null,
    onPermissionRequest: () => () => undefined,
    answerPermission: async () => undefined,
    // Pas de palette dans l'aperçu : elle suit la couche d'overlays du processus principal (ARB-67).
    getPalette: async () => null,
    onPalette: () => () => undefined,
    openPalette: async () => undefined,
    searchPalette: async () => undefined,
    choosePalette: async () => undefined,
    // Pas d'historique dans l'aperçu : il vit dans la base du processus principal (ARB-52).
    searchHistory: async () => [],
    // Pas de dossiers dans l'aperçu : la liste des favoris vit dans la base du processus principal (ARB-48).
    listFavorites: async () => ({ dossiers: [], favoris: [] }),
    createFavoriteFolder: async () => undefined,
    renameFavoriteFolder: async () => undefined,
    deleteFavoriteFolder: async () => undefined,
    moveFavorite: async () => undefined,
    removeFavorite: async () => undefined,
    importFavorites: async () => null,
    openHistoryPage: async () => undefined,
    clearBrowsingData: async () => undefined,
    // Pas de menu contextuel dans l'aperçu : les pages y sont un cadre, sans clic droit de Chromium (ARB-40).
    getPageMenu: async () => null,
    onPageMenu: () => () => undefined,
    pageMenuAction: async () => undefined,
    // Pas de recherche dans l'aperçu : la page y est simulée, Ctrl+F est celui du navigateur.
    findInPage: async () => undefined,
    closeFind: async () => undefined,
    onFindResult: () => () => undefined,
    onFindFocus: () => () => undefined,
    showBlockedPopups: async () => undefined,
    allowPopups: async () => undefined,
    closePopupNotice: async () => undefined,
    getDownloads: async () => downloads,
    onDownloads: (callback) => {
      downloadListeners.add(callback)
      return () => downloadListeners.delete(callback)
    },
    pauseDownload: async (id) => { if (downloads.find((item) => item.id === id)?.etat === 'en-cours') setDownload(id, { etat: 'en-pause' }) },
    resumeDownload: async (id) => { if (downloads.find((item) => item.id === id)?.etat === 'en-pause') setDownload(id, { etat: 'en-cours' }) },
    cancelDownload: async (id) => { if (estActif(downloads.find((item) => item.id === id)?.etat ?? 'annule')) setDownload(id, { etat: 'annule' }) },
    // Pas d'Explorateur dans l'aperçu (ARB-56).
    openDownload: async () => undefined,
    revealDownload: async () => undefined,
    removeDownload: async (id) => {
      const item = downloads.find((candidate) => candidate.id === id)
      if (!item || estActif(item.etat)) return
      downloads = downloads.filter((candidate) => candidate.id !== id)
      downloadListeners.forEach((fn) => fn(downloads))
    },
    // Paramètres (ARB-57) : gardés en mémoire ; pas de boîte système dans l'aperçu, « Choisir » pose un dossier fictif.
    getSettings: async () => ({ ...reglages }),
    setHomePage: async (url) => {
      const accueil = accueilValide(url)
      if (!accueil) throw new Error('Adresse http(s) attendue')
      changerReglages({ ...reglages, accueil })
    },
    setReducedMotion: async (animationsReduites) => changerReglages({ ...reglages, animationsReduites }),
    setArchiveDelay: async (heures) => {
      if (!delaiArchivageValide(heures)) throw new Error('Délai inconnu')
      changerReglages({ ...reglages, archivageHeures: heures })
    },
    setSleepDelay: async (minutes) => {
      if (!delaiVeilleValide(minutes)) throw new Error('Délai inconnu')
      changerReglages({ ...reglages, veilleMinutes: minutes })
    },
    getMemory: async () => ({ mo: 0, enVeille: 0 }),
    listArchive: async () => archive.map((element) => ({ ...element })),
    restoreArchived: async (id) => {
      const element = archive.find((autre) => autre.id === id)
      if (!element) return
      archive = archive.filter((autre) => autre !== element)
      createTab(element.url)
    },
    setDownloadFolder: async (action) => changerReglages({ ...reglages, dossierTelechargements: action === 'choisir' ? 'C:/Users/Aperçu/Téléchargements' : null }),
    onSettings: (callback) => {
      reglagesListeners.add(callback)
      return () => reglagesListeners.delete(callback)
    },
    getSearchEngine: async () => ({ ...moteur }),
    setSearchEngine: async (choix) => { moteur = choix },
    getTheme: async () => theme,
    setTheme: async (choice) => {
      theme = choice
      themeChoiceListeners.forEach((fn) => fn(theme))
    },
    onTheme: (callback) => {
      themeChoiceListeners.add(callback)
      return () => themeChoiceListeners.delete(callback)
    },
    // Dans l'aperçu, Ctrl+L est traité par la page elle-même (MainView) : rien ne l'émet.
    onFocusAddress: () => () => undefined,
    // L'aperçu ne garde pas de session : jamais d'invite de restauration.
    getRestoreOffer: async () => false,
    onRestoreOffer: () => () => undefined,
    answerRestoreOffer: async () => undefined,
    // Ni base ni incident dans l'aperçu.
    getDataIncident: async () => null,
    onDataIncident: () => () => undefined,
    dismissDataIncident: async () => undefined
  }

  createTab('https://www.google.com')
  createTab('https://github.com')
  createTab('https://react.dev')
  activeTabId = tabs[0].id
  window.arbalete = api
  return true
}
