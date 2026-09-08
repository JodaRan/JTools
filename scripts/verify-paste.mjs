/**
 * Vérifie le collage multi-ligne : un bloc copié depuis un fichier devient
 * autant de lignes, en une seule action annulable — et l'aller-retour avec
 * « copier toute la séquence » redonne le texte de départ.
 *
 * Usage : `node scripts/verify-paste.mjs`
 */
import * as fs from 'node:fs'
import { launchApp, STORAGE_DIR } from './app-driver.mjs'

const results = []
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  results.push({ ok, label, actual, expected })
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label} -> ${JSON.stringify(actual)}`)
}

const lineTexts = (page) =>
  page.$$eval('[data-test-input]', (els) => els.map((e) => e.value))

async function addItem(page, name) {
  await page.fill('[data-test="add-input"]', name)
  await page.press('[data-test="add-input"]', 'Enter')
  await page.waitForTimeout(200)
}

/** Alimente le vrai presse-papiers du système, puis colle au clavier. */
async function pasteInto(page, selector, text) {
  await page.evaluate((value) => window.jtools.clipboard.write(value), text)
  await page.click(selector)
  await page.keyboard.press('Control+v')
  await page.waitForTimeout(400)
}

// Un bloc tel qu'on le copierait d'un script : fins de ligne Windows,
// lignes vides de séparation, et une ligne indentée.
const BLOCK = [
  'mysqldump -u root mabase > dump.sql',
  '',
  'gzip dump.sql',
  '  scp dump.sql.gz user@serveur:/backups/',
  '',
  ''
].join('\r\n')

// La ligne vide du milieu est conservée — elle sépare deux étapes ; les deux
// sauts de ligne finaux, eux, sont écartés.
const EXPECTED = [
  'mysqldump -u root mabase > dump.sql',
  '',
  'gzip dump.sql',
  '  scp dump.sql.gz user@serveur:/backups/'
]

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

  // ————————————— Collage dans la ligne fantôme —————————————

  check('séquence vide au départ', await lineTexts(page), [])

  await pasteInto(page, '[data-test="ghost-input"]', BLOCK)

  check('le bloc devient une ligne par ligne de texte', await lineTexts(page), EXPECTED)
  check(
    "l'indentation de début est conservée",
    (await lineTexts(page))[3].startsWith('  scp'),
    true
  )
  check('la ligne vide de séparation est gardée', (await lineTexts(page))[1], '')
  await shot('p10-01-collage-multiligne')

  // Une seule annulation doit tout retirer.
  await page.click('body')
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(400)
  check('un seul Ctrl+Z retire tout le bloc', await lineTexts(page), [])

  await page.keyboard.press('Control+y')
  await page.waitForTimeout(400)
  check('et Ctrl+Y le remet en entier', await lineTexts(page), EXPECTED)

  // ————————————— Collage au milieu d'une ligne existante —————————————

  // On place le curseur à la fin de « gzip dump.sql », puis on colle un saut
  // de ligne suivi d'une commande : cela doit ouvrir une ligne, pas rallonger.
  await page.click(`[data-test-input] >> nth=2`)
  await page.keyboard.press('End')
  await page.evaluate(() => window.jtools.clipboard.write('\nsha256sum dump.sql.gz'))
  await page.keyboard.press('Control+v')
  await page.waitForTimeout(400)

  check(
    'le collage s’intercale à la bonne place',
    await lineTexts(page),
    [
      'mysqldump -u root mabase > dump.sql',
      '',
      'gzip dump.sql',
      'sha256sum dump.sql.gz',
      '  scp dump.sql.gz user@serveur:/backups/'
    ]
  )
  await shot('p10-02-collage-au-milieu')

  // Un collage sans saut de ligne doit rester un collage ordinaire.
  await page.click(`[data-test-input] >> nth=0`)
  await page.keyboard.press('End')
  await page.evaluate(() => window.jtools.clipboard.write(' --single-transaction'))
  await page.keyboard.press('Control+v')
  await page.waitForTimeout(400)
  check(
    'un collage d’une seule ligne ne crée rien',
    (await lineTexts(page))[0],
    'mysqldump -u root mabase > dump.sql --single-transaction'
  )
  check('le nombre de lignes n’a pas bougé', (await lineTexts(page)).length, 5)

  // ————————————— Aller-retour avec « copier toute la séquence » —————————————

  await page.click('[data-test="copy-all"]')
  await page.waitForTimeout(300)
  const copied = await page.evaluate(() => window.jtools.clipboard.read())
  check(
    'la séquence copiée joint les lignes par des sauts de ligne',
    copied.split('\n').length,
    5
  )

  // On recolle ce texte dans une autre séquence : on doit retrouver l'identique.
  await page.click('[data-test="tab-explorer"]')
  await page.waitForTimeout(300)
  await page.click('[data-test-item="Deploy"]')
  await page.waitForTimeout(300)
  await pasteInto(page, '[data-test="ghost-input"]', copied)

  check('l’aller-retour redonne les mêmes lignes', await lineTexts(page), copied.split('\n'))
  await shot('p10-03-aller-retour')

  await close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} vérifications passées`)
if (failed.length) {
  for (const f of failed) console.log(`  ECHEC ${f.label}: attendu ${JSON.stringify(f.expected)}`)
  process.exit(1)
}
process.exit(0)
