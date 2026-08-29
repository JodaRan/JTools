/**
 * Contrôle de fumée sur l'application packagée : c'est elle que l'utilisateur
 * lancera, pas le bundle de développement. À exécuter après `pnpm dist`.
 *
 * Usage : `node scripts/verify-packaged.mjs`
 */
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { APP_DIR, SHOTS } from './app-driver.mjs'

const exe = path.join(APP_DIR, 'dist/win-unpacked/JTools.exe')
if (!fs.existsSync(exe)) {
  console.error(`introuvable : ${exe}\nLancez d'abord « pnpm dist ».`)
  process.exit(1)
}

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(exe, ['--remote-debugging-port=9333'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
child.stderr.on('data', (d) => process.stderr.write(`[app] ${d}`))

const deadline = Date.now() + 30_000
let browser
while (!browser) {
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  } catch (err) {
    if (Date.now() > deadline) throw err
    await new Promise((r) => setTimeout(r, 400))
  }
}

const page = browser
  .contexts()[0]
  .pages()
  .find((p) => !p.url().startsWith('devtools://'))

const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.waitForSelector('[data-test-crumb]', { timeout: 20_000 })

const info = await page.evaluate(async () => ({
  protocole: location.protocol,
  filAriane: [...document.querySelectorAll('[data-test-crumb]')].map((e) => e.textContent.trim()),
  version: await window.jtools.app.getVersion(),
  onglets: [...document.querySelectorAll('[data-test-tab]')].map((e) =>
    e.getAttribute('data-test-tab')
  )
}))

fs.mkdirSync(SHOTS, { recursive: true })
await page.screenshot({ path: path.join(SHOTS, 'p7-packaged.png') })
await browser.close()
child.kill()

console.log(JSON.stringify(info, null, 2))
if (errors.length) {
  console.error('erreurs de page :', errors)
  process.exit(1)
}
console.log('\nApplication packagée : démarrage OK.')
process.exit(0)
