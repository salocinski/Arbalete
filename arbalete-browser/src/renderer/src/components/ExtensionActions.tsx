// Icônes des extensions de la barre de contrôle (ARB-160) : `<browser-action-list>` de electron-chrome-extensions, défini par le
// preload ; un clic ouvre le popup de l'extension (vue native ancrée sur la fenêtre), un clic droit son menu.
export function ExtensionActions({ partition }: { partition: string }) {
  // key : la liste est recréée au changement de profil, donc de session.
  return <browser-action-list key={partition} partition={partition} />
}
