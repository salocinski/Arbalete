// Version de l'application (ARB-77). `VERSION` a 4 segments (0.12.44.22), mais electron-updater compare des versions semver
// à 3 segments : le 4e est replié dans le patch (patch × 1000 + révision), ce qui garde l'ordre. Partagé par scripts/dist.mjs,
// le processus principal et le workflow de release.

// 0.12.44.22 -> 0.12.44022. shortcut: 999 révisions au plus par patch ; passer à un autre repli si on s'en approche.
export function versionSemver(version: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!m || Number(m[4]) > 999) throw new Error(`Version illisible ou révision > 999 : « ${version} »`)
  return `${m[1]}.${m[2]}.${Number(m[3]) * 1000 + Number(m[4])}`
}

// Inverse, pour l'affichage : 0.12.44022 -> 0.12.44.22 ; 0.1.0 (package.json, hors installeur) -> 0.1.0.0.
export function versionAffichee(semver: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(semver)
  if (!m) return semver
  return `${m[1]}.${m[2]}.${Math.floor(Number(m[3]) / 1000)}.${Number(m[3]) % 1000}`
}
