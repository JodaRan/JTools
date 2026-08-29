/**
 * Vérifie de bout en bout la navigation, le CRUD et la persistance :
 * on crée un projet et des séquences par l'interface, on ferme, on rouvre,
 * et tout doit être revenu — y compris l'endroit où on était.
 *
 * Usage : `node scripts/verify-persistence.mjs`
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { launchApp, STORAGE_DIR } from './app-driver.mjs'

const readJson = (name) => {
  const file = path.join(STORAGE_DIR, name)
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : null
}

const results = []
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  results.push({ ok, label, actual, expected })
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label} -> ${JSON.stringify(actual)}`)
}

/** Saisit un nom dans la ligne fantôme et valide. */
async function addItem(page, name) {
  await page.click('[data-test="add-input"]')
  await page.fill('[data-test="add-input"]', name)
  await page.press('[data-test="add-input"]', 'Enter')
  await page.waitForTimeout(200)
}

const crumbs = (page) =>
  page.$$eval('[data-test-crumb]', (els) => els.map((e) => e.textContent.trim()))

const rowNames = (page) =>
  page.$$eval('[data-test-item]', (els) => els.map((e) => e.getAttribute('data-test-item')))

// Départ propre : sans ça on testerait les restes d'un run précédent.
fs.rmSync(STORAGE_DIR, { recursive: true, force: true })
console.log('stockage remis à zéro :', STORAGE_DIR)

// — Premier lancement : navigation + création —
{
  const { page, shot, close } = await launchApp()

  check('démarre sur la liste des outils', await crumbs(page), ['Outils'])

  await page.click('[data-test-tool="sequences"]')
  await page.waitForTimeout(300)
  check("fil d'Ariane après ouverture de l'outil", await crumbs(page), ['Outils', 'Séquences'])

  await addItem(page, 'Serveur Prod')
  await addItem(page, 'Serveur Test')
  check('projets créés', await rowNames(page), ['Serveur Prod', 'Serveur Test'])
  await shot('p3-01-projets')

  await page.click('[data-test-item="Serveur Prod"]')
  await page.waitForTimeout(300)
  check("fil d'Ariane dans le projet", await crumbs(page), [
    'Outils',
    'Séquences',
    'Serveur Prod'
  ])

  await addItem(page, 'Backup BDD')
  await addItem(page, 'Mise à jour du code')
  check('séquences créées', await rowNames(page), ['Backup BDD', 'Mise à jour du code'])
  await shot('p3-02-sequences')

  // Retour à un ancêtre par le fil d'Ariane.
  await page.click('[data-test-crumb="Séquences"]')
  await page.waitForTimeout(300)
  check('retour à la liste des projets', await rowNames(page), ['Serveur Prod', 'Serveur Test'])

  // On repart dans le projet pour que ce soit lui qu'on retrouve au relancement.
  await page.click('[data-test-item="Serveur Prod"]')
  await page.waitForTimeout(600)
  await close()
}

const data = readJson('data.json')
const ui = readJson('ui.json')
check('projets écrits', data?.projects?.length, 2)
check('séquences écrites', data?.sequences?.length, 2)
check('emplacement mémorisé', typeof ui?.explorer?.projectId === 'string', true)

// — Second lancement : tout revient, au bon endroit —
{
  const { page, shot, close } = await launchApp()

  check('rouvre sur le dernier projet', await crumbs(page), ['Outils', 'Séquences', 'Serveur Prod'])
  check('séquences restaurées', await rowNames(page), ['Backup BDD', 'Mise à jour du code'])
  await shot('p3-03-apres-relance')

  // Suppression par le menu ⋮ de la première séquence.
  await page.click('button[title="Actions sur Backup BDD"]')
  await page.waitForTimeout(250)
  await page.click('.n-dropdown-option:has-text("Supprimer")')
  await page.waitForTimeout(300)
  check('séquence supprimée', await rowNames(page), ['Mise à jour du code'])

  await close()
}

const after = readJson('data.json')
check('suppression persistée', after?.sequences?.length, 1)
check('lignes orphelines nettoyées', after?.lines?.length, 0)

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} vérifications passées`)
if (failed.length) {
  for (const f of failed) console.log(`  ECHEC ${f.label}: attendu ${JSON.stringify(f.expected)}`)
  process.exit(1)
}
process.exit(0)
