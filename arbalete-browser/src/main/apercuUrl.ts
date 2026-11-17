// Aperçu de l'adresse d'un lien survolé (ARB-36, décision 0003) : une petite vue native au bas de la page, car la page
// masque tout HTML de la fenêtre (règle 4). Ici, la partie pure : texte affiché, géométrie et document de la vue.

import type { Rectangle } from './bornes.ts'

export type CoteApercu = 'gauche' | 'droite'

export const HAUTEUR_APERCU = 28
// Marge entre la bulle et le bord de la page : jumelle de --space-2 (8 px) dans tokens.css.
const MARGE = 8
// Rayon de la bulle : jumeau de --radius-sm (6 px).
export const RAYON_APERCU = 6
const LARGEUR_MIN = 48
// Au-delà, l'adresse est coupée par des points de suspension.
const LONGUEUR_MAX = 2000
// Caractères de contrôle et marques bidirectionnelles : une adresse ne doit pas pouvoir se faire passer pour une autre.
// oxlint-disable-next-line no-control-regex -- les caractères de contrôle sont justement ce qu'on retire
const INTERDITS = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g

// Couleurs jumelles de --color-surface, --color-text-primary et --color-border de chaque thème (tokens.css), à changer ensemble.
export const COULEURS_APERCU = {
  dark: { fond: '#273746', texte: '#E8EDF2', bord: '#34424F' },
  light: { fond: '#FFFFFF', texte: '#202B36', bord: '#D9E0E7' }
} as const

// Texte à afficher pour l'adresse annoncée par Chromium ; chaîne vide : rien à montrer.
export function texteApercu(url: unknown): string {
  if (typeof url !== 'string') return ''
  const propre = url.replace(INTERDITS, '').trim()
  return propre.length > LONGUEUR_MAX ? propre.slice(0, LONGUEUR_MAX) + '…' : propre
}

// Emplacement de la bulle : en bas de la page, à gauche ou à droite, large selon le texte (7 px par caractère estimés)
// sans dépasser 60 % de la page. shortcut: largeur estimée, pas mesurée, une police large coupe plus tôt.
export function placerApercu(page: Rectangle, texte: string, cote: CoteApercu): Rectangle {
  const disponible = Math.max(0, page.width - 2 * MARGE)
  const largeur = Math.min(Math.max(LARGEUR_MIN, texte.length * 7 + 26), Math.floor(page.width * 0.6), disponible)
  const x = cote === 'gauche' ? page.x + MARGE : page.x + page.width - MARGE - largeur
  return {
    x: Math.round(x),
    y: Math.round(page.y + page.height - MARGE - HAUTEUR_APERCU),
    width: Math.round(largeur),
    height: HAUTEUR_APERCU
  }
}

// Document de la vue : aucun script (la CSP les interdit), le processus principal remplit le texte et le thème.
export function pageApercu(): string {
  const theme = (nom: 'dark' | 'light') => {
    const { fond, texte, bord } = COULEURS_APERCU[nom]
    return `body.${nom}{background:${fond};color:${texte};border-color:${bord}}`
  }
  const html = `<!doctype html><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>
html,body{margin:0;height:100%;overflow:hidden;background:transparent}
body{box-sizing:border-box;display:flex;align-items:center;padding:0 12px;border:1px solid;border-radius:${RAYON_APERCU}px;
font:12px 'Segoe UI',sans-serif;user-select:none;cursor:default}
@media (prefers-reduced-motion:reduce){body{transition:none!important}}
span{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
${theme('dark')}${theme('light')}
</style><body class="dark"><span id="t"></span></body>`
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html)
}

// Infobulle (ARB-126) : la même vue sert l'aperçu d'adresse et l'infobulle d'un bouton. Durées jumelles de
// --duration-panel-open / --duration-panel-close et courbes de --ease-enter / --ease-exit (tokens.css), à changer ensemble.
export const DUREE_OUVERTURE = 180
export const DUREE_FERMETURE = 150
export const COURBE_OUVERTURE = 'cubic-bezier(0.16, 1, 0.3, 1)'
export const COURBE_FERMETURE = 'ease-in'
const ECART_INFOBULLE = 6
const LONGUEUR_MAX_INFOBULLE = 120

// Texte d'une infobulle : même nettoyage qu'une adresse, mais court (un libellé de bouton, pas une page).
export function texteInfobulle(texte: unknown): string {
  return texteApercu(texte).slice(0, LONGUEUR_MAX_INFOBULLE)
}

// Emplacement : sous l'ancre, centrée sur elle, ou au-dessus si le bas de la fenêtre manque ; jamais hors de la fenêtre.
// L'infobulle ne recouvre pas l'ancre, donc jamais la souris qui la survole. shortcut: largeur estimée comme l'aperçu.
export function placerInfobulle(ancre: Rectangle, fenetre: Rectangle, texte: string): Rectangle {
  const largeur = Math.min(Math.max(LARGEUR_MIN, texte.length * 7 + 26), fenetre.width)
  const centre = ancre.x + ancre.width / 2 - largeur / 2
  const x = Math.min(Math.max(centre, fenetre.x), fenetre.x + fenetre.width - largeur)
  const dessous = ancre.y + ancre.height + ECART_INFOBULLE
  const y = dessous + HAUTEUR_APERCU > fenetre.y + fenetre.height ? ancre.y - ECART_INFOBULLE - HAUTEUR_APERCU : dessous
  return { x: Math.round(x), y: Math.round(Math.max(fenetre.y, y)), width: Math.round(largeur), height: HAUTEUR_APERCU }
}

// Fondu d'ouverture ou de fermeture ; `ms` vaut 0 sous prefers-reduced-motion / animations réduites (affichage direct).
export function scriptOuverture(ouvert: boolean, ms: number): string {
  const courbe = ouvert ? COURBE_OUVERTURE : COURBE_FERMETURE
  const depart = ouvert ? "b.style.transition='none';b.style.opacity='0';void b.offsetWidth;" : ''
  return `(()=>{const b=document.body;${depart}b.style.transition='opacity ${ms}ms ${courbe}';b.style.opacity='${ouvert ? 1 : 0}'})()`
}

// Instruction exécutée dans la vue pour y mettre le texte et le thème ; JSON.stringify échappe le texte.
export function scriptApercu(texte: string, theme: 'dark' | 'light'): string {
  return `document.body.className=${JSON.stringify(theme)};document.getElementById('t').textContent=${JSON.stringify(texte)}`
}
