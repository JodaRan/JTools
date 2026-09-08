/**
 * Vérifie les onglets : ouverture depuis l'explorateur, bascule, fermeture par
 * le ×, raccourcis, et restauration de la session au relancement.
 *
 * Usage : `node scripts/verify-tabs.mjs`
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { assertIsolated, launchApp, STORAGE_DIR } from './app-driver.mjs'

const results = []
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  results.push({ ok, label, actual, expected })
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label} -> ${JSON.stringify(actual)}`)
}

const tabTitles = (page) =>
  page.$$eval('[data-test-tab]', (els) => els.map((e) => e.getAttribute('data-test-tab')))

const crumbs = (page) =>
  page.$$eval('[data-test-crumb]', (els) => els.map((e) => e.textContent.trim()))

async function addItem(page, name) {
  await page.fill('[data-test="add-input"]', name)
  await page.press('[data-test="add-input"]', 'Enter')
  await page.waitForTimeout(200)
}

// Ne jamais effacer ailleurs que dans le profil de test.
assertIsolated()
fs.rmSync(STORAGE_DIR, { recursive: true, force: true })
console.log('stockage de test remis à zéro :', STORAGE_DIR)

{
  const { page, shot, close } = await launchApp()

  // Un projet, trois séquences.
  await page.click('[data-test-tool="sequences"]')
  await page.waitForTimeout(250)
  await addItem(page, 'Serveur Prod')
  await page.click('[data-test-item="Serveur Prod"]')
  await page.waitForTimeout(250)
  await addItem(page, 'Backup BDD')
  await addItem(page, 'Deploy')
  await addItem(page, 'Logs')

  check('aucun onglet au départ', await tabTitles(page), [])

  await page.click('[data-test-item="Backup BDD"]')
  await page.waitForTimeout(300)
  check('ouvrir une séquence crée son onglet', await tabTitles(page), ['Backup BDD'])

  // Retour à l'explorateur, puis deux autres séquences.
  await page.click('[data-test="tab-explorer"]')
  await page.waitForTimeout(300)
  check("l'Explorer ramène à la liste", await crumbs(page), [
    'Outils',
    'Séquences',
    'Serveur Prod'
  ])
  check("l'onglet reste ouvert", await tabTitles(page), ['Backup BDD'])

  await page.click('[data-test-item="Deploy"]')
  await page.waitForTimeout(250)
  await page.click('[data-test="tab-explorer"]')
  await page.waitForTimeout(250)
  await page.click('[data-test-item="Logs"]')
  await page.waitForTimeout(300)
  check('trois onglets ouverts', await tabTitles(page), ['Backup BDD', 'Deploy', 'Logs'])
  await shot('p5-01-trois-onglets')

  // Rouvrir une séquence déjà ouverte reprend son onglet au lieu d'en créer un.
  await page.click('[data-test="tab-explorer"]')
  await page.waitForTimeout(250)
  await page.click('[data-test-item="Backup BDD"]')
  await page.waitForTimeout(300)
  check('pas de doublon', await tabTitles(page), ['Backup BDD', 'Deploy', 'Logs'])
  check("on est bien dans l'onglet repris", (await crumbs(page)).at(-1), 'Backup BDD')

  // Ctrl+Tab fait le tour, Explorer compris.
  await page.keyboard.press('Control+Tab')
  await page.waitForTimeout(300)
  check('Ctrl+Tab passe à l\'onglet suivant', (await crumbs(page)).at(-1), 'Deploy')

  // Un onglet ne se ferme qu'à la demande.
  await page.click('[data-test-tab-close="Deploy"]')
  await page.waitForTimeout(300)
  check('onglet fermé par le ×', await tabTitles(page), ['Backup BDD', 'Logs'])
  check('le voisin prend la main', (await crumbs(page)).at(-1), 'Logs')

  await shot('p5-02-apres-fermeture')
  await close()
}

const ui = JSON.parse(fs.readFileSync(path.join(STORAGE_DIR, 'ui.json'), 'utf-8'))
check('onglets enregistrés', ui.tabs.length, 2)
check('onglet actif enregistré', typeof ui.activeTabId === 'string', true)

// — La session revient telle quelle —
{
  const { page, shot, close } = await launchApp()
  check('onglets restaurés', await tabTitles(page), ['Backup BDD', 'Logs'])
  check('rouvre sur le bon onglet', (await crumbs(page)).at(-1), 'Logs')
  await shot('p5-03-session-restauree')
  await close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} vérifications passées`)
if (failed.length) {
  for (const f of failed) console.log(`  ECHEC ${f.label}: attendu ${JSON.stringify(f.expected)}`)
  process.exit(1)
}
process.exit(0)
