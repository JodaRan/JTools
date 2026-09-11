/**
 * Vérifie les deux recherches : la palette d'ouverture rapide (Ctrl+P), qui
 * cherche des noms à travers tous les outils, et la recherche de mots des
 * listes de l'explorateur, qui cherche dans le contenu des lignes.
 *
 * Usage : `node scripts/verify-search.mjs`
 */
import * as fs from 'node:fs'
import { assertIsolated, launchApp, STORAGE_DIR } from './app-driver.mjs'

const results = []
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  results.push({ ok, label, actual, expected })
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label} -> ${JSON.stringify(actual)}`)
}

const crumbs = (page) =>
  page.$$eval('[data-test-crumb]', (els) => els.map((e) => e.textContent.trim()))

async function addInList(page, name) {
  await page.fill('[data-test="add-input"]', name)
  await page.press('[data-test="add-input"]', 'Enter')
  await page.waitForTimeout(200)
}

async function typeLine(page, text) {
  await page.fill('[data-test="ghost-input"]', text)
  await page.press('[data-test="ghost-input"]', 'Enter')
  await page.waitForTimeout(200)
}

/** Ouvre la palette et y tape la recherche. */
async function openPalette(page, text = '') {
  await page.keyboard.press('Control+p')
  await page.waitForSelector('[data-test="palette-input"]', { timeout: 5000 })
  await page.waitForTimeout(200)
  if (text) {
    await page.fill('[data-test="palette-input"]', text)
    await page.waitForTimeout(250)
  }
}

/** Les noms proposés par la palette, dans l'ordre où elle les range. */
const paletteNames = (page) =>
  page.$$eval('[data-test-palette-item]', (els) =>
    els.map((e) => e.querySelector('span').textContent.trim())
  )

/** Les en-têtes de groupe de la palette : un par outil représenté. */
const paletteGroups = (page) =>
  page.$$eval('[data-test="palette"] p', (els) =>
    els.map((e) => e.textContent.trim().replace(/\s+/g, ' '))
  )

// Ne jamais effacer ailleurs que dans le profil de test.
assertIsolated()
fs.rmSync(STORAGE_DIR, { recursive: true, force: true })
console.log('stockage de test remis à zéro :', STORAGE_DIR)

{
  const { page, shot, close } = await launchApp()

  // — Mise en place : deux projets de séquences, et un tableau de tâches —
  await page.click('[data-test-tool="sequences"]')
  await page.waitForTimeout(250)
  await addInList(page, 'Serveur Prod')
  await addInList(page, 'Poste local')

  await page.click('[data-test-item="Serveur Prod"]')
  await page.waitForTimeout(250)
  await addInList(page, 'Backup BDD')
  await addInList(page, 'Deploiement')

  await page.click('[data-test-item="Backup BDD"]')
  await page.waitForTimeout(300)
  await typeLine(page, 'mysqldump -u root mabase > dump.sql')
  await typeLine(page, 'gzip dump.sql')
  await typeLine(page, 'scp dump.sql.gz user@serveur:/backups/')

  await page.click('[data-test-crumb="Serveur Prod"]')
  await page.waitForTimeout(250)
  await page.click('[data-test-item="Deploiement"]')
  await page.waitForTimeout(300)
  await typeLine(page, 'git pull origin main')
  await typeLine(page, 'pnpm install --frozen-lockfile')
  await typeLine(page, 'systemctl restart mabase-api')

  await page.click('[data-test-crumb="Outils"]')
  await page.waitForTimeout(250)
  await page.click('[data-test-tool="tasks"]')
  await page.waitForTimeout(250)
  await addInList(page, 'Equipe')
  await page.click('[data-test-item="Equipe"]')
  await page.waitForTimeout(250)
  await addInList(page, 'Sprint Backup')
  await page.waitForTimeout(300)

  // ————————————————— Palette d'ouverture rapide —————————————————

  // On est dans le tableau « Sprint Backup » : l'outil Tâches passe devant.
  await openPalette(page)
  const groups = await paletteGroups(page)
  check('la palette groupe par outil', groups.length >= 2, true)
  check('l’outil courant est annoncé en tête', groups[0], 'Tâches · outil courant')
  check('les autres outils suivent', groups[1].startsWith('Séquences'), true)
  check('un séparateur les sépare', await page.$$eval('[data-test="palette-separator"]', (e) => e.length), 1)
  await shot('p8-01-palette-outil-courant')

  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  check('Échap referme la palette', await page.$('[data-test="palette-input"]'), null)

  // La recherche traverse les outils : « backup » existe des deux côtés.
  await openPalette(page, 'backup')
  const found = await paletteNames(page)
  check('la palette traverse tous les outils', found, ['Sprint Backup', 'Backup BDD'])
  check('l’outil courant reste prioritaire', found[0], 'Sprint Backup')
  await shot('p8-02-palette-recherche')

  // Appariement approximatif : des lettres éparses suffisent.
  await page.fill('[data-test="palette-input"]', 'dplmt')
  await page.waitForTimeout(250)
  check('les lettres éparses retrouvent le nom', await paletteNames(page), ['Deploiement'])

  // Le nom du projet compte aussi.
  await page.fill('[data-test="palette-input"]', 'serveur prod')
  await page.waitForTimeout(250)
  check('le projet ramène ses séquences', (await paletteNames(page)).sort(), [
    'Backup BDD',
    'Deploiement'
  ])

  await page.fill('[data-test="palette-input"]', 'zzz introuvable')
  await page.waitForTimeout(250)
  check('rien ne correspond, et ça se dit', await paletteNames(page), [])

  // Entrée ouvre la première proposition, où qu'elle vive.
  await page.fill('[data-test="palette-input"]', 'backup bdd')
  await page.waitForTimeout(250)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  check('Entrée ouvre la séquence choisie', (await crumbs(page)).at(-1), 'Backup BDD')
  check('et la palette se referme', await page.$('[data-test="palette-input"]'), null)

  // Depuis l'index des outils, aucun n'est prioritaire.
  await page.click('[data-test-crumb="Outils"]')
  await page.waitForTimeout(300)
  await openPalette(page)
  const neutral = await paletteGroups(page)
  check(
    'sur l’index des outils, aucun n’est marqué courant',
    neutral.some((label) => label.includes('outil courant')),
    false
  )
  check('les groupes suivent alors l’ordre du catalogue', neutral[0].startsWith('Séquences'), true)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)

  // ————————————————— Recherche de mots —————————————————

  await page.click('[data-test-tool="sequences"]')
  await page.waitForTimeout(300)
  check('la liste des projets porte un champ de recherche', await page.$('[data-test="lines-search"]') !== null, true)

  // Ctrl+F y amène le curseur sans avoir à viser le champ.
  await page.keyboard.press('Control+f')
  await page.waitForTimeout(200)
  check(
    'Ctrl+F pose le curseur dans le champ',
    await page.evaluate(() => document.activeElement?.getAttribute('data-test')),
    'lines-search'
  )

  await page.keyboard.type('mabase')
  await page.waitForTimeout(400)
  const hits = await page.$$eval('[data-test-result-line]', (els) =>
    els.map((e) => e.textContent.replace(/\s+/g, ' ').trim())
  )
  check('la recherche traverse tous les projets de l’outil', hits.length, 2)
  check('elle rend la ligne du backup', hits.some((t) => t.includes('mysqldump')), true)
  check('et celle du déploiement', hits.some((t) => t.includes('systemctl')), true)
  check(
    'les séquences trouvées sont annoncées',
    (await page.$$eval('[data-test-result-sequence]', (els) =>
      els.map((e) => e.getAttribute('data-test-result-sequence'))
    )).sort(),
    ['Backup BDD', 'Deploiement']
  )
  await shot('p8-03-recherche-mots')

  // Deux mots : chacun doit porter, sur la même ligne.
  await page.fill('[data-test="lines-search"]', 'gzip dump')
  await page.waitForTimeout(400)
  check('deux mots se cumulent sur une même ligne', await page.$$eval('[data-test-result-line]', (e) => e.length), 1)

  await page.fill('[data-test="lines-search"]', 'gzip systemctl')
  await page.waitForTimeout(400)
  check('deux mots dispersés ne donnent rien', await page.$$eval('[data-test-result-line]', (e) => e.length), 0)

  // Un résultat ouvre la séquence et pose le halo sur la ligne trouvée.
  await page.fill('[data-test="lines-search"]', 'systemctl')
  await page.waitForTimeout(400)
  await page.click('[data-test-result-line]')
  await page.waitForTimeout(600)
  check('le résultat ouvre sa séquence', (await crumbs(page)).at(-1), 'Deploiement')
  check(
    'et la ligne trouvée porte le halo',
    await page.$$eval('[data-test-spotlit="true"]', (els) => els.length),
    1
  )
  await shot('p8-04-resultat-ouvert')

  // Effacer la recherche rend la liste : rien n'est perdu en route.
  await page.click('[data-test-crumb="Serveur Prod"]')
  await page.waitForTimeout(300)
  await page.fill('[data-test="lines-search"]', 'git')
  await page.waitForTimeout(400)
  check('depuis un projet, la portée se limite à lui', await page.$$eval('[data-test-result-line]', (e) => e.length), 1)
  check('la liste laisse la place aux résultats', await page.$('[data-test="add-input"]'), null)

  await page.fill('[data-test="lines-search"]', '')
  await page.waitForTimeout(300)
  check(
    'effacer la recherche rend la liste',
    await page.$$eval('[data-test-item]', (els) => els.map((e) => e.getAttribute('data-test-item'))),
    ['Backup BDD', 'Deploiement']
  )

  // L'outil Tâches garde sa propre recherche, et n'en reçoit pas une seconde.
  await page.click('[data-test-crumb="Outils"]')
  await page.waitForTimeout(250)
  await page.click('[data-test-tool="tasks"]')
  await page.waitForTimeout(300)
  check('la liste des projets de Tâches n’a pas de recherche de lignes', await page.$('[data-test="lines-search"]'), null)

  await close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} vérifications passées`)
if (failed.length) {
  for (const f of failed) console.log(`  ECHEC ${f.label}: attendu ${JSON.stringify(f.expected)}`)
  process.exit(1)
}
process.exit(0)
