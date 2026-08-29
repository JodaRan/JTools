/**
 * Capture l'état courant de l'app dans les deux thèmes, sidebar ouverte.
 * Utile pour relire une modification d'interface d'un coup d'œil.
 *
 * Usage : `node scripts/shoot.mjs [préfixe]`
 */
import { launchApp } from './app-driver.mjs'

const prefix = process.argv[2] ?? 'apercu'
const { page, shot, close } = await launchApp()

// Sidebar ouverte, pour montrer la coquille complète.
const sidebarOpen = await page.$$eval('[data-test="sidebar"]', (els) => els.length > 0)
if (!sidebarOpen) {
  await page.click('[data-test="sidebar-toggle"]')
  await page.waitForTimeout(400)
}

const themeOf = () =>
  page.evaluate(() => (document.documentElement.classList.contains('dark') ? 'sombre' : 'clair'))

await shot(`${prefix}-${await themeOf()}`)
await page.click('[data-test="theme-toggle"]')
await page.waitForTimeout(500)
await shot(`${prefix}-${await themeOf()}`)

// On repart dans le thème d'origine pour ne pas modifier l'état de l'app.
await page.click('[data-test="theme-toggle"]')
await page.waitForTimeout(400)

console.log('captures écrites dans .shots/')
await close()
process.exit(0)
