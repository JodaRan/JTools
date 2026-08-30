/**
 * Lanceur partagé par les scripts de vérification : démarre JTools buildé et
 * s'y connecte en CDP.
 *
 * Passe par --remote-debugging-port plutôt que par `_electron.launch` de
 * Playwright, qui n'accroche pas Electron 44.
 */
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

export const APP_DIR = path.resolve(import.meta.dirname, '..')
export const SHOTS = process.env.SCREENSHOT_DIR || path.join(APP_DIR, '.shots')

/** Là où Electron range userData sous Windows, d'après le `name` du package. */
export const STORAGE_DIR = path.join(process.env.APPDATA ?? '', 'jtools', 'JTools')

/**
 * `passphrase` déverrouille automatiquement au démarrage ; `manualUnlock` rend
 * la main sur l'écran de déverrouillage, pour les scripts qui veulent le
 * piloter eux-mêmes.
 */
export async function launchApp({
  port = 9222,
  quiet = false,
  passphrase = null,
  manualUnlock = false
} = {}) {
  fs.mkdirSync(SHOTS, { recursive: true })

  // L'hôte VSCode exporte ELECTRON_RUN_AS_NODE=1 ; hérité, il ferait démarrer
  // Electron en simple runtime Node et `require('electron')` renverrait un
  // chemin de fichier au lieu de l'API.
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE

  const child = spawn(
    path.join(APP_DIR, 'node_modules/electron/dist/electron.exe'),
    [APP_DIR, `--remote-debugging-port=${port}`],
    { cwd: APP_DIR, env, stdio: ['ignore', 'pipe', 'pipe'] }
  )
  if (!quiet) child.stderr.on('data', (d) => process.stderr.write(`[electron] ${d}`))

  const deadline = Date.now() + 30_000
  let browser
  while (!browser) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
    } catch (err) {
      if (Date.now() > deadline) throw err
      await new Promise((r) => setTimeout(r, 400))
    }
  }

  const page = browser
    .contexts()[0]
    .pages()
    .find((p) => !p.url().startsWith('devtools://'))
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('[console:error]', m.text())
  })

  const session = {
    page,
    browser,
    child,
    async shot(name) {
      await page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
    },
    /**
     * Ferme par le bouton × de la titlebar, pour emprunter le vrai chemin de
     * sortie (`beforeunload` → purge synchrone des JSON) plutôt qu'un kill,
     * qui perdrait les écritures encore en attente.
     */
    async close({ viaUi = true } = {}) {
      const exited = new Promise((resolve) => child.once('exit', resolve))
      if (viaUi) {
        await page
          .evaluate(() => {
            const buttons = [...document.querySelectorAll('header button')]
            buttons.at(-1).click()
          })
          .catch(() => {})
        await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))])
      }
      await browser.close().catch(() => {})
      if (child.exitCode === null) child.kill()
      await new Promise((r) => setTimeout(r, 600))
    }
  }

  // Au premier lancement, JTools propose de chiffrer ; coffre actif, il demande
  // la passphrase. Dans les deux cas il faut franchir cette porte avant que le
  // fil d'Ariane — seul élément commun à toutes les routes — n'existe.
  await page.waitForSelector('[data-test-crumb], [data-test="vault-gate"]', {
    timeout: 20_000
  })

  const locked = (await page.$('[data-test="unlock-input"]')) !== null

  // Le script prend la main : on ne franchit pas la porte pour lui.
  if (locked && manualUnlock) return session

  if (locked) {
    if (!passphrase) {
      await session.close({ viaUi: false })
      throw new Error('Application verrouillée : passphrase requise.')
    }
    await page.fill('[data-test="unlock-input"] input', passphrase)
    await page.click('[data-test="unlock-submit"]')
  } else if (await page.$('[data-test="setup-decline"]')) {
    // Les scripts qui ne testent pas le coffre travaillent en clair.
    await page.click('[data-test="setup-decline"]')
  }

  // La dérivation scrypt coûte environ une seconde au déverrouillage.
  await page.waitForSelector('[data-test-crumb]', { timeout: 20_000 })
  return session
}
