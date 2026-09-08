/**
 * Vérifie l'annulation globale et le panneau latéral : Ctrl+Z ramène ce qui a
 * été supprimé, y compris depuis un autre onglet, en y renavigant ; les lignes
 * cachées et l'historique sont consultables à droite.
 *
 * Usage : `node scripts/verify-undo.mjs`
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { launchApp, STORAGE_DIR } from './app-driver.mjs'

const results = []
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  results.push({ ok, label, actual, expected })
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label} -> ${JSON.stringify(actual)}`)
}

const lines = (page) => page.$$eval('[data-test-input]', (els) => els.map((e) => e.value))
const crumbs = (page) =>
  page.$$eval('[data-test-crumb]', (els) => els.map((e) => e.textContent.trim()))
const rowNames = (page) =>
  page.$$eval('[data-test-item]', (els) => els.map((e) => e.getAttribute('data-test-item')))

async function addItem(page, name) {
  await page.fill('[data-test="add-input"]', name)
  await page.press('[data-test="add-input"]', 'Enter')
  await page.waitForTimeout(200)
}

async function addLine(page, text) {
  await page.click('[data-test="ghost-input"]')
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(150)
}

fs.rmSync(STORAGE_DIR, { recursive: true, force: true })
console.log('stockage remis à zéro :', STORAGE_DIR)

{
  const { page, shot, close } = await launchApp()

  await page.click('[data-test-tool="sequences"]')
  await page.waitForTimeout(250)
  await addItem(page, 'Serveur Prod')
  await page.click('[data-test-item="Serveur Prod"]')
  await page.waitForTimeout(250)
  await addItem(page, 'Backup BDD')
  await addItem(page, 'Deploy')

  await page.click('[data-test-item="Backup BDD"]')
  await page.waitForTimeout(300)
  await addLine(page, 'mysqldump -u root mabase > dump.sql')
  await addLine(page, 'gzip dump.sql')
  await addLine(page, 'scp dump.sql.gz serveur:/backups/')
  check('trois lignes en place', (await lines(page)).length, 3)

  // — Annulation d'une suppression de ligne, depuis un AUTRE onglet —
  const ids = await page.$$eval('[data-test-input]', (els) =>
    els.map((e) => e.getAttribute('data-test-input'))
  )
  await page.click(`[data-test-delete="${ids[1]}"]`)
  await page.waitForTimeout(300)
  check('ligne supprimée', await lines(page), [
    'mysqldump -u root mabase > dump.sql',
    'scp dump.sql.gz serveur:/backups/'
  ])

  await page.click('[data-test="tab-explorer"]')
  await page.waitForTimeout(250)
  await page.click('[data-test-item="Deploy"]')
  await page.waitForTimeout(300)
  check('on est parti dans un autre onglet', (await crumbs(page)).at(-1), 'Deploy')

  await page.keyboard.press('Control+z')
  await page.waitForTimeout(900)
  check("Ctrl+Z a ramené sur l'onglet concerné", (await crumbs(page)).at(-1), 'Backup BDD')
  check('la ligne est revenue à sa place', await lines(page), [
    'mysqldump -u root mabase > dump.sql',
    'gzip dump.sql',
    'scp dump.sql.gz serveur:/backups/'
  ])
  const spotlit = await page.$$eval('[data-test-spotlit]', (els) => els.length)
  check('la ligne restaurée est mise en évidence', spotlit, 1)
  await shot('p6-01-annulation')

  // — Rétablissement —
  await page.keyboard.press('Control+y')
  await page.waitForTimeout(700)
  check('Ctrl+Y a resupprimé la ligne', (await lines(page)).length, 2)
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(700)

  // — Annulation d'une suppression de séquence entière —
  await page.click('[data-test="tab-explorer"]')
  await page.waitForTimeout(300)
  await page.click('button[title="Actions sur Deploy"]')
  await page.waitForTimeout(250)
  await page.click('.n-dropdown-option:has-text("Supprimer")')
  await page.waitForTimeout(300)
  check('séquence supprimée', await rowNames(page), ['Backup BDD'])
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(700)
  check('séquence restaurée', await rowNames(page), ['Backup BDD', 'Deploy'])

  // — Panneau latéral : lignes cachées —
  await page.click('[data-test-item="Backup BDD"]')
  await page.waitForTimeout(300)
  const current = await page.$$eval('[data-test-input]', (els) =>
    els.map((e) => e.getAttribute('data-test-input'))
  )
  await page.click(`[data-test-menu="${current[2]}"]`)
  await page.waitForTimeout(250)
  await page.click('.n-dropdown-option:has-text("Cacher")')
  await page.waitForTimeout(300)

  await page.click('[data-test="sidebar-toggle"]')
  await page.waitForTimeout(300)
  await page.click('[data-test-panel="hidden"]')
  await page.waitForTimeout(250)
  check('la ligne cachée apparaît dans le panneau', await page.$$eval('[data-test-hidden]', (e) => e.length), 1)
  await shot('p6-02-sidebar-cachees')

  await page.click(`[data-test-unhide="${current[2]}"]`)
  await page.waitForTimeout(400)
  check('réaffichage depuis le panneau', (await lines(page)).length, 3)

  // — Panneau latéral : historique —
  await page.click('[data-test-panel="history"]')
  await page.waitForTimeout(300)
  const historyCount = await page.$$eval('[data-test="sidebar"] li', (els) => els.length)
  check("l'historique n'est pas vide", historyCount > 0, true)
  await shot('p6-03-sidebar-historique')

  await close()
}

// — Le panneau et son onglet actif font partie de l'état restauré —
{
  const { page, close } = await launchApp()
  const open = await page.$$eval('[data-test="sidebar"]', (els) => els.length)
  check('panneau latéral rouvert', open, 1)
  const panel = await page.$$eval('[data-test="sidebar"] [data-test-panel="history"]', (els) =>
    els[0].className.includes('bg-app-surface-2')
  )
  check('panneau actif mémorisé', panel, true)
  await close()
}

// ————————————— Séquence neuve, texte non validé, Ctrl+Z —————————————
//
// Le réflexe venu du bloc-notes : « ce que je viens de taper est faux, j'annule ».
// Il ne doit pas emporter la séquence qu'on vient de créer.
fs.rmSync(STORAGE_DIR, { recursive: true, force: true })

{
  const { page, shot, close } = await launchApp()

  await page.click('[data-test-tool="sequences"]')
  await page.waitForTimeout(250)
  await addItem(page, 'Projet Neuf')
  await page.click('[data-test-item="Projet Neuf"]')
  await page.waitForTimeout(250)
  await addItem(page, 'Sequence Neuve')
  await page.click('[data-test-item="Sequence Neuve"]')
  await page.waitForTimeout(400)

  // On tape sans valider ni quitter le champ.
  await page.click('[data-test="ghost-input"]')
  await page.type('[data-test="ghost-input"]', 'commande incorrecte')
  await page.waitForTimeout(300)

  await page.keyboard.press('Control+z')
  await page.waitForTimeout(600)

  check(
    'le premier Ctrl+Z ne touche pas à la séquence',
    (await crumbs(page)).at(-1),
    'Sequence Neuve'
  )
  check(
    'il annule la frappe en cours',
    await page.inputValue('[data-test="ghost-input"]'),
    ''
  )
  check('et ne crée aucune ligne', (await lines(page)).length, 0)
  await shot('p11-01-frappe-annulee')

  // Champ vide : l'annulation applicative reprend la main et retire la séquence.
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(700)
  check(
    'le second Ctrl+Z ramène à la liste des séquences',
    (await crumbs(page)).at(-1),
    'Projet Neuf'
  )
  check('la séquence a bien disparu', await rowNames(page), [])
  await shot('p11-02-sequence-annulee')

  // Et le rétablissement fonctionne — c'est ce que la ligne orpheline cassait.
  await page.keyboard.press('Control+y')
  await page.waitForTimeout(700)
  check('Ctrl+Y rétablit la séquence', await rowNames(page), ['Sequence Neuve'])
  await shot('p11-03-sequence-retablie')

  await close()
}

// Aucune ligne ne doit traîner sans séquence.
{
  const data = JSON.parse(fs.readFileSync(path.join(STORAGE_DIR, 'data.json'), 'utf-8'))
  const vivantes = new Set(data.sequences.map((s) => s.id))
  check(
    'aucune ligne orpheline sur le disque',
    data.lines.filter((l) => !vivantes.has(l.sequenceId)).length,
    0
  )
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} vérifications passées`)
if (failed.length) {
  for (const f of failed) console.log(`  ECHEC ${f.label}: attendu ${JSON.stringify(f.expected)}`)
  process.exit(1)
}
process.exit(0)
