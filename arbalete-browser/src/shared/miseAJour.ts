// État des mises à jour automatiques (ARB-77, EP-14), partagé par le processus principal et l'interface.
// `inactive` : application non empaquetée (npm run dev), rien ne se vérifie.
export type EtatMiseAJour = {
  etat: 'inactive' | 'a-jour' | 'recherche' | 'telechargement' | 'prete' | 'erreur'
  // Version installée, à 4 segments.
  version: string
  // Version trouvée (telechargement, prete), à 4 segments.
  nouvelle?: string
  // Avancement du téléchargement, 0 à 100.
  pourcent?: number
}
