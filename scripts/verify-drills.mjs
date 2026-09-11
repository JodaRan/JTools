/**
 * Vérifie l'outil Exercices sur l'application réelle : création des types de
 * départ, import d'un CSV, correction, score, leçon dans le panneau latéral,
 * archivage d'une série et persistance.
 *
 * L'import passe par le presse-papiers plutôt que par le fichier : une boîte
 * de dialogue native ne se pilote pas en CDP, et c'est de toute façon le
 * chemin le plus court entre un LLM et l'application.
 *
 * Usage : `node scripts/verify-drills.mjs`
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { APP_DIR, assertIsolated, launchApp, STORAGE_DIR } from './app-driver.mjs'

const results = []
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  results.push({ ok, label, actual, expected })
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label} -> ${JSON.stringify(actual)}`)
}

const CSV = fs.readFileSync(path.join(APP_DIR, 'samples', 'exercices-test.csv'), 'utf-8')

const names = (page) =>
  page.$$eval('[data-test-item]', (els) => els.map((el) => el.getAttribute('data-test-item')))

const questionCount = (page) => page.locator('[data-test-question]').count()

const scoreText = (page) =>
  page.$eval('[data-test="score"]', (el) => el.textContent.replace(/\s+/g, ' ').trim())

async function openItem(page, name) {
  await page.click(`[data-test-item="${name}"]`)
  await page.waitForTimeout(300)
}

/** Choisit une entrée du menu déroulant de Naive UI par son libellé. */
async function pickMenu(page, trigger, label) {
  await page.click(trigger)
  await page.waitForSelector('.n-dropdown-option')
  await page.locator(`.n-dropdown-option:has-text("${label}")`).first().click()
  await page.waitForTimeout(400)
}

assertIsolated()
fs.rmSync(STORAGE_DIR, { recursive: true, force: true })
console.log('stockage de test remis à zéro :', STORAGE_DIR)

{
  const { page, shot, close } = await launchApp()

  await page.click('[data-test-tool="drills"]')
  await page.waitForTimeout(250)

  await page.click('[data-test="seed-drills"]')
  await page.waitForTimeout(400)
  check('les cinq types de départ sont créés', await names(page), [
    'Raisonnement numérique',
    'Raisonnement logique pratique',
    'Stratégie',
    'Mathématiques',
    'Communication'
  ])
  await shot('p13-01-types')

  await openItem(page, 'Mathématiques')
  check('seules les mathématiques ont plusieurs parties', await names(page), [
    'Première',
    'Terminale',
    'Première année de physique'
  ])

  await openItem(page, 'Terminale')
  await page.waitForSelector('[data-test="import-csv"]')
  check('une partie neuve est vide', await questionCount(page), 0)

  // Le CSV livré passe par le presse-papiers, comme le ferait un copier-coller
  // depuis la réponse d'un LLM.
  await page.evaluate((csv) => window.jtools.clipboard.write(csv), CSV)
  await pickMenu(page, '[data-test="import-csv"]', 'Coller à la suite')
  check('le CSV livré entre en entier', await questionCount(page), 6)
  await shot('p13-02-import')

  // Une réponse numérique : 80 € remisés de 25 % puis majorés de 20 %.
  const first = page.locator('[data-test-question]').first()
  await first.locator('[data-test-input]').fill('72')
  await first.locator('[data-test-input]').press('Enter')
  await page.waitForTimeout(300)
  check(
    'une réponse juste est reconnue',
    await first.locator('[data-test-verdict]').getAttribute('data-test-verdict'),
    'right'
  )

  // Une réponse à choix, fausse : le corrigé apparaît alors, pas avant.
  const third = page.locator('[data-test-question]').nth(2)
  await third.locator('[data-test-choice="0"]').click()
  await page.waitForTimeout(300)
  check(
    'une réponse fausse est reconnue',
    await third.locator('[data-test-verdict]').getAttribute('data-test-verdict'),
    'wrong'
  )
  check(
    'la réponse attendue est montrée après coup',
    (await third.locator('[data-test-expected]').textContent()).trim(),
    'On ne peut rien conclure sur Félix'
  )
  check('le score compte les justes sur les répondues', await scoreText(page), '1 / 2 correctes')
  await shot('p13-03-correction')

  await page.click('[data-test-filter="todo"]')
  await page.waitForTimeout(250)
  check('le filtre ne garde que les questions sans réponse', await questionCount(page), 4)
  await page.click('[data-test-filter="all"]')
  await page.waitForTimeout(250)

  // La leçon s'affiche à droite, jamais dans la carte.
  await page.locator('[data-test-lesson]').first().click()
  await page.waitForSelector('[data-test="lesson-text"]')
  const lesson = await page.$eval('[data-test="lesson-text"]', (el) => el.textContent)
  check('la leçon s’ouvre dans le panneau de droite', lesson.includes('contraposée'), true)
  await shot('p13-04-lecon')

  // Réinitialiser archive au lieu d'effacer.
  await page.click('[data-test="reset-score"]')
  await page.waitForTimeout(500)
  check('le compteur repart de zéro', await scoreText(page), '0 / 0 correctes')
  check('la série est archivée', await page.locator('[data-test-run]').count(), 1)
  await shot('p13-05-series')

  await close()

  const stored = JSON.parse(fs.readFileSync(`${STORAGE_DIR}/data.json`, 'utf-8'))
  check('les questions sont sur le disque', stored.questions.length, 6)
  check('les cinq guides de prompt aussi', stored.drillTypes.length, 5)
  check('la série archivée survit', stored.drillRuns.length, 1)
  check('elle garde le détail des réponses', stored.drillRuns[0].answers.length, 2)
  check('le score en cours est bien reparti de zéro', stored.drillSets.every((set) => set.answers.length === 0), true)
}

{
  // Relance : l'onglet de la partie et ses questions reviennent tels quels.
  const { page, shot, close } = await launchApp()
  await page.waitForSelector('[data-test-question]')
  check('la partie rouvre sur son onglet', await questionCount(page), 6)
  check('le score rouvre à zéro', await scoreText(page), '0 / 0 correctes')
  await shot('p13-06-apres-relance')
  await close()
}

const failed = results.filter((result) => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} vérifications passées`)
if (failed.length > 0) {
  for (const result of failed) {
    console.log(`ECHEC ${result.label}\n  attendu ${JSON.stringify(result.expected)}`)
  }
  process.exit(1)
}
