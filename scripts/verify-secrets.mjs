/**
 * Vérifie les trois ajouts de la 1.1 : lignes masquées, retour au niveau
 * supérieur (chevron et Retour arrière), et affichage de deux onglets côte
 * à côte.
 *
 * Usage : `node scripts/verify-secrets.mjs`
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

const crumbs = (page) =>
  page.$$eval('[data-test-crumb]', (els) => els.map((e) => e.textContent.trim()))

const lineIds = (page) =>
  page.$$eval('[data-test-line]', (els) => els.map((e) => e.getAttribute('data-test-line')))

const count = (page, selector) => page.$$eval(selector, (els) => els.length)

async function addItem(page, name) {
  await page.fill('[data-test="add-input"]', name)
  await page.press('[data-test="add-input"]', 'Enter')
  await page.waitForTimeout(200)
}

async function typeLine(page, text) {
  await page.fill('[data-test="ghost-input"]', text)
  await page.press('[data-test="ghost-input"]', 'Enter')
  await page.waitForTimeout(200)
}

/** Choisit une entrée du menu ⋮ d'une ligne, par son libellé. */
async function pickInRowMenu(page, lineId, label) {
  await page.click(`[data-test-menu="${lineId}"]`)
  await page.waitForTimeout(250)
  await page.click(`.n-dropdown-option:has-text("${label}")`)
  await page.waitForTimeout(300)
}

const SECRET = 'MotDePasseSuperSecret42'

// Ne jamais effacer ailleurs que dans le profil de test.
assertIsolated()
fs.rmSync(STORAGE_DIR, { recursive: true, force: true })
console.log('stockage de test remis à zéro :', STORAGE_DIR)

{
  const { page, shot, close } = await launchApp()

  await page.click('[data-test-tool="sequences"]')
  await page.waitForTimeout(250)
  await addItem(page, 'Serveur Prod')
  await page.click('[data-test-item="Serveur Prod"]')
  await page.waitForTimeout(250)
  await addItem(page, 'Backup BDD')
  await addItem(page, 'Deploy')

  // ————————————————————— Retour au niveau supérieur —————————————————————

  check('on est dans le projet', (await crumbs(page)).at(-1), 'Serveur Prod')
  await page.click('[data-test="back"]')
  await page.waitForTimeout(300)
  check('le chevron remonte à la liste des projets', (await crumbs(page)).at(-1), 'Séquences')

  // Retour arrière hors champ de saisie : même effet que le chevron.
  await page.click('body')
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(300)
  check('Retour arrière remonte encore', await crumbs(page), ['Outils'])
  check('plus de chevron à la racine', await count(page, '[data-test="back"]'), 0)

  // ————————————————————————— Lignes masquées —————————————————————————

  await page.click('[data-test-tool="sequences"]')
  await page.waitForTimeout(250)
  await page.click('[data-test-item="Serveur Prod"]')
  await page.waitForTimeout(250)
  await page.click('[data-test-item="Backup BDD"]')
  await page.waitForTimeout(300)

  await typeLine(page, 'mysqldump -u root mabase > dump.sql')
  await typeLine(page, SECRET)

  const ids = await lineIds(page)
  check('deux lignes saisies', ids.length, 2)

  const secret = ids[1]
  check('aucune ligne masquée au départ', await count(page, '[data-test-reveal]'), 0)

  await pickInRowMenu(page, secret, 'Masquer le contenu')
  await shot('p8-01-ligne-masquee')

  check(
    "l'oeil n'apparaît que sur la ligne masquée",
    await page.$$eval('[data-test-reveal]', (els) =>
      els.map((e) => e.getAttribute('data-test-reveal'))
    ),
    [secret]
  )
  check(
    'le contenu est obscurci',
    await page.getAttribute(`[data-test-input="${secret}"]`, 'data-test-masked'),
    'true'
  )
  // Le texte reste intact dans le champ : c'est un masquage d'affichage.
  check(
    'la valeur réelle est préservée',
    await page.inputValue(`[data-test-input="${secret}"]`),
    SECRET
  )

  await page.click(`[data-test-reveal="${secret}"]`)
  await page.waitForTimeout(250)
  check(
    "l'oeil révèle le contenu",
    await page.getAttribute(`[data-test-input="${secret}"]`, 'data-test-masked'),
    null
  )
  await shot('p8-02-ligne-revelee')

  // Le journal ne doit jamais recopier un secret.
  await page.click('[data-test="sidebar-toggle"]')
  await page.waitForTimeout(300)
  const journal = await page.$$eval('[data-test="sidebar"] li', (els) =>
    els.map((e) => e.textContent)
  )
  check(
    "le mot de passe n'apparaît pas dans l'historique",
    journal.some((t) => t.includes(SECRET)),
    false
  )

  await page.click('[data-test-panel="masked"]')
  await page.waitForTimeout(300)
  check(
    'la ligne est inventoriée dans le panneau « Masquées »',
    await count(page, '[data-test-masked-row]'),
    1
  )
  await shot('p8-03-panneau-masquees')
  await page.click('[data-test="sidebar-toggle"]')
  await page.waitForTimeout(200)

  // ————————————————————————— Volet de droite —————————————————————————

  await page.click('[data-test="tab-explorer"]')
  await page.waitForTimeout(250)
  await page.click('[data-test-item="Deploy"]')
  await page.waitForTimeout(300)

  check('pas de volet droit au départ', await count(page, '[data-test="split-pane"]'), 0)

  // Clic droit sur le premier onglet -> « Ouvrir à droite ».
  await page.click('[data-test-tab="Backup BDD"]', { button: 'right' })
  await page.waitForTimeout(300)
  await page.click('.n-dropdown-option:has-text("Ouvrir à droite")')
  await page.waitForTimeout(400)

  check('le volet droit est ouvert', await count(page, '[data-test="split-pane"]'), 1)
  check("l'onglet dédoublé est marqué", await count(page, '[data-test-tab-split]'), 1)
  check('le volet principal a basculé sur Deploy', (await crumbs(page)).at(-1), 'Deploy')
  check(
    'les deux séquences sont visibles à la fois',
    await page.$$eval('[data-test="sequence-name"]', (els) => els.map((e) => e.value)),
    ['Deploy', 'Backup BDD']
  )
  check('aucun bouton retour dans le volet droit', await count(page, '[data-test="back"]'), 1)
  await shot('p8-04-split-view')

  await close()
}

// — L'état survit au redémarrage —
const ui = JSON.parse(fs.readFileSync(path.join(STORAGE_DIR, 'ui.json'), 'utf-8'))
check('volet droit enregistré', typeof ui.split.tabId === 'string', true)

const data = JSON.parse(fs.readFileSync(path.join(STORAGE_DIR, 'data.json'), 'utf-8'))
check('schéma migré en v3', data.version, 3)
check('le masquage est persisté', data.lines.filter((l) => l.masked).length, 1)

{
  const { page, shot, close } = await launchApp()

  check('le volet droit est restauré', await count(page, '[data-test="split-pane"]'), 1)
  check('la ligne masquée le reste après relance', await count(page, '[data-test-reveal]'), 1)
  check('et elle rouvre bien masquée', await count(page, '[data-test-masked]'), 1)
  await shot('p8-05-split-restaure')

  await page.click('[data-test="split-close"]')
  await page.waitForTimeout(300)
  check('le volet se ferme par son ×', await count(page, '[data-test="split-pane"]'), 0)

  await close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} vérifications passées`)
if (failed.length) {
  for (const f of failed) console.log(`  ECHEC ${f.label}: attendu ${JSON.stringify(f.expected)}`)
  process.exit(1)
}
process.exit(0)
