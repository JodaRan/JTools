/**
 * Vérifie la vue finale d'input : saisie enchaînée, insertion par l'interstice,
 * déplacement clavier, copie, commentaire, masquage, suppression, persistance.
 *
 * Usage : `node scripts/verify-lines.mjs`
 */
import * as fs from 'node:fs'
import { launchApp, STORAGE_DIR } from './app-driver.mjs'

const results = []
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  results.push({ ok, label, actual, expected })
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label} -> ${JSON.stringify(actual)}`)
}

const lines = (page) => page.$$eval('[data-test-input]', (els) => els.map((e) => e.value))

async function addViaGhost(page, text) {
  await page.click('[data-test="ghost-input"]')
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(150)
}

fs.rmSync(STORAGE_DIR, { recursive: true, force: true })
console.log('stockage remis à zéro :', STORAGE_DIR)

{
  const { page, shot, close } = await launchApp()

  // Mise en place : un projet, une séquence, puis on entre dedans.
  await page.click('[data-test-tool="sequences"]')
  await page.waitForTimeout(250)
  await page.fill('[data-test="add-input"]', 'Serveur Prod')
  await page.press('[data-test="add-input"]', 'Enter')
  await page.waitForTimeout(200)
  await page.click('[data-test-item="Serveur Prod"]')
  await page.waitForTimeout(250)
  await page.fill('[data-test="add-input"]', 'Backup BDD')
  await page.press('[data-test="add-input"]', 'Enter')
  await page.waitForTimeout(200)
  await page.click('[data-test-item="Backup BDD"]')
  await page.waitForTimeout(300)

  check('vue finale vide au départ', await lines(page), [])

  // — Saisie enchaînée depuis la ligne fantôme, sans jamais quitter le clavier —
  await addViaGhost(page, 'mysqldump -u root mabase > dump.sql')
  await addViaGhost(page, 'gzip dump.sql')
  await addViaGhost(page, 'scp dump.sql.gz user@serveur:/backups/')
  check('trois lignes saisies à la file', await lines(page), [
    'mysqldump -u root mabase > dump.sql',
    'gzip dump.sql',
    'scp dump.sql.gz user@serveur:/backups/'
  ])
  const ghostStillFocused = await page.evaluate(
    () => document.activeElement?.getAttribute('data-test') === 'ghost-input'
  )
  check('le focus reste dans la fantôme', ghostStillFocused, true)
  await shot('p4-01-saisie')

  // — Entrée au milieu : crée et donne le focus à la ligne suivante —
  const second = (await page.$$('[data-test-input]'))[1]
  await second.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('sha256sum dump.sql.gz')
  await page.waitForTimeout(300)
  check('ligne insérée après la deuxième', (await lines(page))[2], 'sha256sum dump.sql.gz')

  // — Insertion par l'interstice, avant la première ligne —
  await page.click('[data-test-insert="0"]', { force: true })
  await page.keyboard.type('ssh user@serveur')
  await page.waitForTimeout(300)
  check('ligne insérée en tête', (await lines(page))[0], 'ssh user@serveur')
  await shot('p4-02-insertion')

  // — Déplacement au clavier (équivalent du glisser-déposer) —
  const first = (await page.$$('[data-test-input]'))[0]
  await first.click()
  await page.keyboard.press('Alt+ArrowDown')
  await page.waitForTimeout(300)
  check('ligne descendue d\'un rang', (await lines(page))[1], 'ssh user@serveur')

  // — Copie d'une ligne dans le presse-papiers —
  const ids = await page.$$eval('[data-test-input]', (els) =>
    els.map((e) => e.getAttribute('data-test-input'))
  )
  await page.click(`[data-test-copy="${ids[0]}"]`)
  await page.waitForTimeout(250)
  const clip = await page.evaluate(() => window.jtools.clipboard.read())
  check('presse-papiers alimenté', clip, 'mysqldump -u root mabase > dump.sql')

  // — Masquage par le menu ⋮ —
  await page.click(`[data-test-menu="${ids[4]}"]`)
  await page.waitForTimeout(250)
  await page.click('.n-dropdown-option:has-text("Cacher")')
  await page.waitForTimeout(300)
  check('ligne retirée de la liste visible', (await lines(page)).length, 4)

  // — Suppression directe —
  const remaining = await page.$$eval('[data-test-input]', (els) =>
    els.map((e) => e.getAttribute('data-test-input'))
  )
  await page.click(`[data-test-delete="${remaining[3]}"]`)
  await page.waitForTimeout(300)
  check('ligne supprimée', (await lines(page)).length, 3)
  await shot('p4-03-final')

  const snapshot = await lines(page)
  await close()

  // — La séquence revient telle quelle, directement dans son onglet —
  const second_run = await launchApp()
  await second_run.page.waitForTimeout(400)
  const reopenedOn = await second_run.page.$$eval('[data-test-crumb]', (els) =>
    els.at(-1).textContent.trim()
  )
  check('rouvre directement sur la séquence', reopenedOn, 'Backup BDD')
  check('lignes restaurées après relance', await lines(second_run.page), snapshot)
  const hidden = await second_run.page.evaluate(
    () => document.body.innerText.includes('cachée(s)')
  )
  check('le compteur de lignes cachées est affiché', hidden, true)
  await second_run.shot('p4-04-apres-relance')
  await second_run.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} vérifications passées`)
if (failed.length) {
  for (const f of failed) console.log(`  ECHEC ${f.label}: attendu ${JSON.stringify(f.expected)}`)
  process.exit(1)
}
process.exit(0)
