import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { creerMiseAJour, type MiseAJourUpdater } from './miseAJour.ts'
import type { EtatMiseAJour } from '../shared/miseAJour.ts'
import { versionAffichee, versionSemver } from '../shared/version.ts'

class FauxUpdater extends EventEmitter {
  autoDownload = false
  autoInstallOnAppQuit = false
  allowDowngrade = true
  allowPrerelease = true
  verifications = 0
  installations: Array<[boolean, boolean]> = []
  echec = false
  async checkForUpdates() {
    this.verifications++
    if (this.echec) throw new Error('réseau')
    this.emit('checking-for-update')
  }
  quitAndInstall(silencieux: boolean, relancer: boolean) { this.installations.push([silencieux, relancer]) }
}

function monter(actif = true) {
  const updater = new FauxUpdater()
  const diffusions: EtatMiseAJour[] = []
  const mj = creerMiseAJour({ updater: updater as unknown as MiseAJourUpdater, versionSemver: '0.12.44022', actif, diffuser: (e) => diffusions.push(e) })
  return { updater, mj, diffusions }
}

test('versionSemver replie le 4e segment dans le patch et versionAffichee le défait', () => {
  assert.equal(versionSemver('0.12.44.22'), '0.12.44022')
  assert.equal(versionAffichee('0.12.44022'), '0.12.44.22')
  assert.equal(versionAffichee('0.1.0'), '0.1.0.0')
  assert.equal(versionAffichee('pas une version'), 'pas une version')
  // L'ordre est gardé, y compris d'un patch à l'autre.
  const [a, b, c] = ['0.12.44.22', '0.12.44.100', '0.12.45.0'].map((v) => Number(versionSemver(v).split('.')[2]))
  assert.ok(a < b && b < c)
})

test('versionSemver refuse une version à 3 segments ou une révision de plus de 999', () => {
  assert.throws(() => versionSemver('0.12.44'))
  assert.throws(() => versionSemver('0.12.44.1000'))
  assert.throws(() => versionSemver('0.12.44.x'))
})

test('hors application empaquetée : inactive, aucune vérification, rien de réglé', async () => {
  const { updater, mj } = monter(false)
  await mj.verifier()
  mj.installer()
  assert.equal(mj.etat().etat, 'inactive')
  assert.equal(updater.verifications, 0)
  assert.equal(updater.autoDownload, false)
  assert.equal(updater.installations.length, 0)
})

test('réglage de l\'updater : téléchargement et installation à la fermeture, ni rétrogradation ni préversion', () => {
  const { updater } = monter()
  assert.deepEqual([updater.autoDownload, updater.autoInstallOnAppQuit, updater.allowDowngrade, updater.allowPrerelease], [true, true, false, false])
})

test('recherche, version trouvée, progression puis mise à jour prête', async () => {
  const { updater, mj, diffusions } = monter()
  await mj.verifier()
  assert.equal(mj.etat().etat, 'recherche')
  updater.emit('update-available', { version: '0.12.45001' })
  assert.deepEqual(mj.etat(), { etat: 'telechargement', version: '0.12.44.22', nouvelle: '0.12.45.1', pourcent: 0 })
  updater.emit('download-progress', { percent: 41.6 })
  assert.equal(mj.etat().pourcent, 42)
  updater.emit('download-progress', { percent: 250 })
  assert.equal(mj.etat().pourcent, 100)
  updater.emit('update-downloaded', { version: '0.12.45001' })
  assert.deepEqual(mj.etat(), { etat: 'prete', version: '0.12.44.22', nouvelle: '0.12.45.1' })
  assert.equal(diffusions.at(-1)?.etat, 'prete')
})

test('aucune nouvelle version : à jour', async () => {
  const { updater, mj } = monter()
  await mj.verifier()
  updater.emit('update-not-available', { version: '0.12.44022' })
  assert.equal(mj.etat().etat, 'a-jour')
})

test('pas de nouvelle vérification pendant une recherche, un téléchargement ou une mise à jour prête', async () => {
  const { updater, mj } = monter()
  await mj.verifier()
  await mj.verifier()
  updater.emit('update-available', { version: '0.12.45001' })
  await mj.verifier()
  updater.emit('update-downloaded', { version: '0.12.45001' })
  await mj.verifier()
  assert.equal(updater.verifications, 1)
})

test('une erreur de l\'updater ou de la vérification donne `erreur`, et une vérification suivante reste permise', async () => {
  const { updater, mj, diffusions } = monter()
  updater.echec = true
  await mj.verifier()
  assert.equal(mj.etat().etat, 'erreur')
  updater.emit('error', new Error('x'))
  assert.equal(mj.etat().etat, 'erreur')
  updater.echec = false
  await mj.verifier()
  assert.equal(updater.verifications, 2)
  assert.equal(mj.etat().etat, 'recherche')
  assert.ok(diffusions.length >= 2)
})

test('installer ne lance l\'installation que si la mise à jour est téléchargée', () => {
  const { updater, mj } = monter()
  mj.installer()
  assert.equal(updater.installations.length, 0)
  updater.emit('update-downloaded', { version: '0.12.45001' })
  mj.installer()
  assert.deepEqual(updater.installations, [[true, true]])
})

test('une progression reçue hors téléchargement est ignorée, et une erreur répétée n’est pas rediffusée', async () => {
  const { updater, mj, diffusions } = monter()
  updater.emit('download-progress', { percent: 50 })
  assert.equal(mj.etat().etat, 'a-jour')
  assert.equal(diffusions.length, 0)
  updater.echec = true
  await mj.verifier()
  await mj.verifier()
  assert.equal(diffusions.filter((e) => e.etat === 'erreur').length, 1)
})

test('planifier : première vérification à 30 s puis toutes les 6 h, rien hors application empaquetée', () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  try {
    const inactif = monter(false)
    inactif.mj.planifier()
    mock.timers.tick(7 * 3_600_000)
    assert.equal(inactif.updater.verifications, 0)

    const { updater, mj } = monter()
    mj.planifier()
    mock.timers.tick(29_999)
    assert.equal(updater.verifications, 0)
    mock.timers.tick(1)
    assert.equal(updater.verifications, 1)
    updater.emit('update-not-available', {})
    mock.timers.tick(6 * 3_600_000)
    assert.equal(updater.verifications, 2)
  } finally {
    mock.timers.reset()
  }
})

test('une erreur reçue alors que la mise à jour est prête ne la fait pas disparaître', () => {
  const { updater, mj } = monter()
  updater.emit('update-downloaded', { version: '0.12.45001' })
  updater.emit('error', new Error('x'))
  assert.equal(mj.etat().etat, 'prete')
})
