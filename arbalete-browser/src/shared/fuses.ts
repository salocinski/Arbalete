// Fuses d'Electron (ARB-137) lus dans le binaire produit : le fil des fuses suit un marqueur fixe, puis la version du
// format, le nombre de fuses et un octet par fuse ('0' éteint, '1' allumé, 'r' retiré). Ordre de la version 1 d'Electron.
const MARQUEUR = 'dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'
const NOMS_V1 = [
  'runAsNode',
  'enableCookieEncryption',
  'enableNodeOptionsEnvironmentVariable',
  'enableNodeCliInspectArguments',
  'enableEmbeddedAsarIntegrityValidation',
  'onlyLoadAppFromAsar',
  'loadBrowserProcessSpecificV8Snapshot',
  'grantFileProtocolExtraPrivileges'
]

// Les fuses posés par electronFuses d'electron-builder.yml ; grantFileProtocolExtraPrivileges reste à sa valeur par défaut
// tant que l'interface est chargée en file:// (ARB-138).
export const FUSES_ATTENDUS: Record<string, boolean> = {
  runAsNode: false,
  enableNodeCliInspectArguments: false,
  enableNodeOptionsEnvironmentVariable: false,
  onlyLoadAppFromAsar: true,
  enableEmbeddedAsarIntegrityValidation: true
}

// Position du marqueur dans les octets (Uint8Array : ce fichier est vérifié aussi sans types Node).
function chercherMarqueur(binaire: Uint8Array): number {
  const motif = new TextEncoder().encode(MARQUEUR)
  const premier = motif[0]
  for (
    let i = binaire.indexOf(premier);
    i >= 0 && i <= binaire.length - motif.length;
    i = binaire.indexOf(premier, i + 1)
  ) {
    if (motif.every((octet, j) => binaire[i + j] === octet)) return i
  }
  return -1
}

export function lireFuses(binaire: Uint8Array): Record<string, boolean> | null {
  const debut = chercherMarqueur(binaire)
  if (debut < 0) return null
  const apres = debut + MARQUEUR.length
  if (binaire[apres] !== 1) return null // version du format inconnue
  const nombre = binaire[apres + 1]
  if (!(nombre >= 1 && apres + 2 + nombre <= binaire.length)) return null
  const fuses: Record<string, boolean> = {}
  for (let i = 0; i < nombre; i++) {
    const octet = binaire[apres + 2 + i]
    if (octet !== 48 && octet !== 49 && octet !== 114) return null // pas un fil de fuses : '0', '1' ou 'r' seulement
    if (i < NOMS_V1.length && octet !== 114) fuses[NOMS_V1[i]] = octet === 49
  }
  return fuses
}

// Écarts entre les fuses lus et FUSES_ATTENDUS, en phrases ; vide si le binaire est conforme.
export function ecartsFuses(binaire: Uint8Array): string[] {
  const lus = lireFuses(binaire)
  if (!lus) return ['fuses introuvables ou version inconnue']
  return Object.entries(FUSES_ATTENDUS)
    .filter(([nom, valeur]) => lus[nom] !== valeur)
    .map(([nom, valeur]) => `${nom} : attendu ${valeur}, lu ${lus[nom] ?? 'absent'}`)
}
// Dossier de l'application empaquetée dont dist.mjs relit les fuses : celui de `--prepackaged` (aussi `--pd`, `--x <d>` ou
// `--x=<d>`), sinon release/win-unpacked ; null si l'option est donnée sans valeur (ou avec une autre option à la place).
// shortcut: un autre `directories.output` (-c.directories.output) n'est pas suivi (release.yml n'en change pas) ; à gérer si besoin.
export function dossierApplication(args: string[]): string | null {
  const i = args.findIndex((a) => /^--(prepackaged|pd)(=|$)/.test(a))
  if (i < 0) return 'release/win-unpacked'
  const dossier = args[i].includes('=') ? args[i].slice(args[i].indexOf('=') + 1) : args[i + 1]
  return dossier && !dossier.startsWith('-') ? dossier : null
}
