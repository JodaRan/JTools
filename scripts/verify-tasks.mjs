/**
 * Vérifie l'outil Tâches sur l'application réelle : création d'un tableau,
 * saisie en rafale, tri par priorité, glisser-déposer entre colonnes,
 * annulation et persistance.
 *
 * Le point le plus important est la règle de déplacement : une carte ne se
 * dépose que dans un groupe de sa propre priorité. On le vérifie en la
 * traînant réellement à la souris, pas en appelant la commande.
 *
 * Usage : `node scripts/verify-tasks.mjs`
 */
import * as fs from 'node:fs'
import { assertIsolated, launchApp, STORAGE_DIR } from './app-driver.mjs'

const results = []
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  results.push({ ok, label, actual, expected })
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label} -> ${JSON.stringify(actual)}`)
}

/** Titres des cartes d'une colonne, dans l'ordre affiché. */
const cards = (page, column) =>
  page.$$eval(`[data-test-column="${column}"] [data-test-task]`, (els) =>
    els.map((el) => el.querySelector('p').textContent.trim())
  )

const columnIds = (page) =>
  page.$$eval('[data-test-column]', (els) =>
    els.map((el) => el.getAttribute('data-test-column'))
  )

const columnNames = (page) =>
  page.$$eval('[data-test-column] header button', (els) =>
    els.map((el) => el.textContent.trim()).filter((text) => text.length > 0)
  )

async function addItem(page, name) {
  await page.fill('[data-test="add-input"]', name)
  await page.press('[data-test="add-input"]', 'Enter')
  await page.waitForTimeout(200)
}

/** Saisie en rafale : le composeur reste ouvert d'une tâche à l'autre. */
async function addTasks(page, column, titles) {
  await page.click(`[data-test-add="${column}"]`)
  const selector = `[data-test-composer="${column}"]`
  await page.waitForSelector(selector)
  for (const title of titles) {
    await page.fill(selector, title)
    await page.press(selector, 'Enter')
    await page.waitForTimeout(120)
  }
  await page.press(selector, 'Escape')
  await page.waitForTimeout(200)
}

/** Ouvre le panneau d'une carte et lui donne une priorité. */
async function setPriority(page, title, priority) {
  await page.click(`[data-test-task]:has-text("${title}")`)
  await page.waitForSelector('[data-test="task-peek"]')
  await page.click(`[data-test-set-priority="${priority}"]`)
  await page.waitForTimeout(150)
  await page.click('[data-test="peek-close"]')
  await page.waitForTimeout(150)
}

/**
 * Glisser-déposer à la souris.
 *
 * Deux précautions : Sortable écoute des mouvements successifs — un saut d'un
 * point à l'autre ne déclenche rien — et la zone de dépôt d'un groupe vide
 * n'apparaît qu'une fois le glissement commencé. On ne mesure donc la cible
 * qu'après avoir bougé.
 */
async function drag(page, fromSelector, toSelector) {
  const from = await page.locator(fromSelector).first().boundingBox()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 12)
  await page.waitForTimeout(200)

  const to = await page.locator(toSelector).first().boundingBox()
  if (!to) throw new Error(`zone de dépôt introuvable : ${toSelector}`)

  const targetX = to.x + to.width / 2
  const targetY = to.y + Math.min(24, to.height / 2)
  const startX = from.x + from.width / 2
  const startY = from.y + from.height / 2
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(
      startX + ((targetX - startX) * step) / 12,
      startY + ((targetY - startY) * step) / 12
    )
    await page.waitForTimeout(30)
  }
  await page.mouse.up()
  await page.waitForTimeout(400)
}

assertIsolated()
fs.rmSync(STORAGE_DIR, { recursive: true, force: true })
console.log('stockage de test remis à zéro :', STORAGE_DIR)

{
  const { page, shot, close } = await launchApp()

  await page.click('[data-test-tool="tasks"]')
  await page.waitForTimeout(250)
  await addItem(page, 'Ephrata')
  await page.click('[data-test-item="Ephrata"]')
  await page.waitForTimeout(250)
  await addItem(page, 'Sprint 1')
  await page.click('[data-test-item="Sprint 1"]')
  await page.waitForSelector('[data-test-column]')

  check('un tableau naît avec ses quatre colonnes', await columnNames(page), [
    'À faire',
    'En cours',
    'En révision',
    'Terminé'
  ])

  const [todo, doing] = await columnIds(page)

  await addTasks(page, todo, ['Corriger le login', 'Facture PDF', 'Filtres avancés'])
  check('saisie en rafale', await cards(page, todo), [
    'Corriger le login',
    'Facture PDF',
    'Filtres avancés'
  ])
  await shot('p12-01-saisie-rafale')

  // Les priorités remontent les cartes : le tri est structurel, pas manuel.
  await setPriority(page, 'Filtres avancés', 'urgent')
  await setPriority(page, 'Facture PDF', 'high')
  check('les cartes se rangent par priorité', await cards(page, todo), [
    'Filtres avancés',
    'Facture PDF',
    'Corriger le login'
  ])
  await shot('p12-02-tri-priorites')

  // Déplacement entre colonnes, à priorité constante.
  await drag(
    page,
    `[data-test-column="${todo}"] [data-test-task]:has-text("Facture PDF")`,
    `[data-test-column="${doing}"] [data-priority="high"]`
  )
  check('la carte a changé de colonne', await cards(page, doing), ['Facture PDF'])
  check('la colonne de départ ne la garde pas', await cards(page, todo), [
    'Filtres avancés',
    'Corriger le login'
  ])
  const moved = await page.$eval(
    '[data-test-column] [data-test-task]:has-text("Facture PDF")',
    (el) => el.querySelector('[data-test-priority]').getAttribute('data-test-priority')
  )
  check('le déplacement n’a pas touché à la priorité', moved, 'high')
  await shot('p12-03-deplacement')

  // Une urgente ne peut pas atterrir chez les hautes : le groupe de dépôt
  // n'accepte que sa propre priorité.
  await drag(
    page,
    `[data-test-column="${todo}"] [data-test-task]:has-text("Filtres avancés")`,
    `[data-test-column="${doing}"] [data-priority="high"]`
  )
  check('une urgente ne rejoint pas les hautes', await cards(page, doing), ['Facture PDF'])

  await page.keyboard.press('Control+z')
  await page.waitForTimeout(400)
  check('Ctrl+Z ramène la carte déplacée', await cards(page, todo), [
    'Filtres avancés',
    'Facture PDF',
    'Corriger le login'
  ])
  await page.keyboard.press('Control+y')
  await page.waitForTimeout(400)
  check('Ctrl+Y la renvoie', await cards(page, doing), ['Facture PDF'])

  // Recherche : elle filtre l'affichage sans toucher aux données.
  await page.fill('[data-test="board-search"]', 'filtres')
  await page.waitForTimeout(300)
  check('la recherche ne garde que ce qui correspond', await cards(page, todo), [
    'Filtres avancés'
  ])
  check('les colonnes sans correspondance se vident', await cards(page, doing), [])
  await page.fill('[data-test="board-search"]', '')
  await page.waitForTimeout(300)
  check('effacer la recherche rend tout', await cards(page, doing), ['Facture PDF'])

  // Échéance et estimation depuis le panneau.
  await page.click('[data-test-task]:has-text("Corriger le login")')
  await page.waitForSelector('[data-test="task-peek"]')
  await page.fill('[data-test="task-due"]', '2026-12-24')
  await page.waitForTimeout(200)
  await shot('p12-04-panneau')
  await page.click('[data-test="peek-close"]')
  await page.waitForTimeout(200)

  await close()

  const stored = JSON.parse(fs.readFileSync(`${STORAGE_DIR}/data.json`, 'utf-8'))
  check('les tâches sont sur le disque', stored.tasks.length, 3)
  check('les colonnes aussi', stored.columns.length, 4)
  check(
    'la date de changement de statut est posée',
    stored.tasks.some((task) => task.statusChangedAt !== ''),
    true
  )
  check(
    'l’échéance survit à la fermeture',
    stored.tasks.filter((task) => task.dueDate === '2026-12-24').length,
    1
  )
}

{
  // Relance : onglet, colonnes et cartes doivent revenir tels quels.
  const { page, shot, close } = await launchApp()
  await page.waitForSelector('[data-test-column]')
  const ids = await columnIds(page)
  check('le tableau rouvre sur son onglet', await columnNames(page), [
    'À faire',
    'En cours',
    'En révision',
    'Terminé'
  ])
  check('les cartes sont là', await cards(page, ids[0]), [
    'Filtres avancés',
    'Corriger le login'
  ])
  await shot('p12-05-apres-relance')
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
