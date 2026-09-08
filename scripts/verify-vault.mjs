/**
 * Vérifie le coffre : activation, chiffrement effectif du disque, clé de
 * secours, déverrouillage au démarrage, changement de mot de passe,
 * verrouillage manuel et désactivation.
 *
 * Usage : `node scripts/verify-vault.mjs`
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

const count = (page, selector) => page.$$eval(selector, (els) => els.length)

const crumbs = (page) =>
  page.$$eval('[data-test-crumb]', (els) => els.map((e) => e.textContent.trim()))

const readFile = (name) => fs.readFileSync(path.join(STORAGE_DIR, name), 'utf-8')
const exists = (name) => fs.existsSync(path.join(STORAGE_DIR, name))

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

/** Ouvre le menu de l'application et choisit une entrée par son libellé. */
async function pickInAppMenu(page, label) {
  await page.click('[data-test="app-menu"]')
  await page.waitForTimeout(250)
  await page.click(`.n-dropdown-option:has-text("${label}")`)
  await page.waitForTimeout(400)
}

const PASS = 'chevalCorrectAgrafeBatterie'
const NEXT = 'nouvelleGrandePhraseDePasse'
const SECRET = 'MotDePasseProd-8Kx#2025'

// Ne jamais effacer ailleurs que dans le profil de test.
assertIsolated()
fs.rmSync(STORAGE_DIR, { recursive: true, force: true })
console.log('stockage de test remis à zéro :', STORAGE_DIR)

let recoveryKey = ''

// ————————————— Premier lancement : l'offre de chiffrer —————————————
{
  const { page, shot, close } = await launchApp()

  // `launchApp` a décliné l'offre : on travaille d'abord en clair, pour
  // vérifier ensuite que l'activation chiffre bien l'existant.
  await page.click('[data-test-tool="sequences"]')
  await page.waitForTimeout(250)
  await addItem(page, 'Serveur Prod')
  await page.click('[data-test-item="Serveur Prod"]')
  await page.waitForTimeout(250)
  await addItem(page, 'Backup BDD')
  await page.click('[data-test-item="Backup BDD"]')
  await page.waitForTimeout(300)
  await typeLine(page, SECRET)
  // L'enregistrement est différé de 400 ms : laisser le fichier s'écrire.
  await page.waitForTimeout(900)

  check('sans coffre, aucun vault.json', exists('vault.json'), false)
  check('et les données sont en clair sur le disque', readFile('data.json').includes(SECRET), true)
  check('aucun cadenas dans la barre de titre', await count(page, '[data-test="vault-badge"]'), 0)

  // — Activation depuis le menu —
  await pickInAppMenu(page, 'Sécurité')
  await page.click('[data-test="open-enable"]')
  await page.waitForTimeout(200)
  await page.fill('[data-test="vault-settings"] input >> nth=0', PASS)
  await page.fill('[data-test="vault-settings"] input >> nth=1', PASS)
  await shot('p9-01-activation')
  await page.click('[data-test="confirm-enable"]')
  // La dérivation scrypt prend environ une seconde.
  await page.waitForSelector('[data-test="recovery-key"]', { timeout: 15_000 })

  recoveryKey = (await page.textContent('[data-test="recovery-key"]')).trim()
  check('une clé de secours est présentée', /^[A-Z2-9]{5}-/.test(recoveryKey), true)
  await shot('p9-02-cle-de-secours')

  // On ne peut pas passer outre sans confirmer l'avoir mise de côté.
  check(
    'le bouton reste bloqué tant que la clé n’est pas confirmée',
    await page.isDisabled('[data-test="recovery-done"]'),
    true
  )
  await page.click('[data-test="recovery-confirm"]')
  await page.click('[data-test="recovery-done"]')
  await page.waitForTimeout(500)

  check('le cadenas apparaît', await count(page, '[data-test="vault-badge"]'), 1)

  await close()
}

// ————————————— Le disque est réellement chiffré —————————————
check('vault.json est créé', exists('vault.json'), true)
check('data.json ne contient plus le secret', readFile('data.json').includes(SECRET), false)
check(
  'data.json est une enveloppe chiffrée',
  JSON.parse(readFile('data.json')).jtools,
  'encrypted'
)
check(
  'history.json aussi',
  JSON.parse(readFile('history.json')).jtools,
  'encrypted'
)
// ui.json reste lisible : le processus principal en a besoin avant la passphrase.
check('ui.json reste en clair', typeof JSON.parse(readFile('ui.json')).window, 'object')
check(
  'ui.json ne porte que des identifiants opaques',
  readFile('ui.json').includes('Backup BDD'),
  false
)
check(
  'vault.json ne contient pas la passphrase',
  readFile('vault.json').includes(PASS),
  false
)

// ————————————— Redémarrage : la passphrase est exigée —————————————
{
  const { page, shot, close } = await launchApp({ manualUnlock: true })

  check('le démarrage exige la passphrase', await count(page, '[data-test="unlock-input"]'), 1)
  check('aucune donnée avant déverrouillage', await count(page, '[data-test-crumb]'), 0)
  await shot('p9-03-verrou-au-demarrage')

  // Un mot de passe faux ne doit pas ouvrir.
  await page.fill('[data-test="unlock-input"] input', 'pas le bon du tout')
  await page.click('[data-test="unlock-submit"]')
  await page.waitForTimeout(3000)
  check('un mot de passe faux est refusé', await count(page, '[data-test="unlock-error"]'), 1)

  await close({ viaUi: false })
}

{
  const { page, shot, close } = await launchApp({ passphrase: PASS })

  check('la bonne passphrase rouvre la session', (await crumbs(page)).at(-1), 'Backup BDD')
  check(
    'et la ligne chiffrée est bien relue',
    await page.$$eval('[data-test-line]', (els) => els.length),
    1
  )
  await shot('p9-04-deverrouille')

  // — La sauvegarde copiée est chiffrée, elle aussi —
  await pickInAppMenu(page, 'Copier la sauvegarde')
  const copied = await page.evaluate(() => window.jtools.clipboard.read())
  check('la sauvegarde copiée ne contient pas le secret', copied.includes(SECRET), false)
  const envelope = JSON.parse(copied)
  check('elle est chiffrée', envelope.jtools, 'encrypted')
  // Elle embarque son propre matériel de clé : c'est ce qui la rend lisible
  // sur une autre machine, avec la passphrase du poste d'origine.
  check('elle embarque le matériel de clé', typeof envelope.vault?.kdf?.salt, 'string')
  check('la passphrase n’y figure pas', copied.includes(PASS), false)

  // — Le délai de verrouillage se règle et se retient —
  await pickInAppMenu(page, 'Sécurité')
  await page.click('[data-test="idle-select"]')
  await page.waitForTimeout(300)
  await page.click('.n-base-select-option:has-text("Après 5 minutes")')
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // — Changement de mot de passe —
  await pickInAppMenu(page, 'Sécurité')
  await page.click('[data-test="open-change-passphrase"]')
  await page.waitForTimeout(200)
  await page.fill('[data-test="vault-settings"] input >> nth=0', PASS)
  await page.fill('[data-test="vault-settings"] input >> nth=1', NEXT)
  await page.fill('[data-test="vault-settings"] input >> nth=2', NEXT)
  await page.click('[data-test="confirm-passphrase"]')
  await page.waitForTimeout(3000)
  check(
    'le changement est confirmé',
    (await page.textContent('[data-test="vault-settings"]')).includes('Mot de passe changé'),
    true
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // — Verrouillage manuel —
  await pickInAppMenu(page, 'Verrouiller maintenant')
  check('le verrou reprend la main', await count(page, '[data-test="unlock-input"]'), 1)
  check('et le contenu disparaît', await count(page, '[data-test-line]'), 0)
  await shot('p9-05-verrouille')

  // L'ancien mot de passe ne doit plus ouvrir.
  await page.fill('[data-test="unlock-input"] input', PASS)
  await page.click('[data-test="unlock-submit"]')
  await page.waitForTimeout(3000)
  check(
    'l’ancien mot de passe est refusé',
    await count(page, '[data-test="unlock-error"]'),
    1
  )

  await page.fill('[data-test="unlock-input"] input', NEXT)
  await page.click('[data-test="unlock-submit"]')
  await page.waitForSelector('[data-test-crumb]', { timeout: 15_000 })
  check('le nouveau mot de passe ouvre', await count(page, '[data-test="unlock-input"]'), 0)

  await close()
}

check(
  'le délai de verrouillage est enregistré',
  JSON.parse(readFile('ui.json')).security.idleLockMinutes,
  5
)

// ————————————— La clé de secours ouvre aussi —————————————
{
  const { page, shot, close } = await launchApp({ manualUnlock: true })

  await page.click('[data-test="toggle-recovery"]')
  await page.waitForTimeout(200)
  await page.fill('[data-test="unlock-input"] input', recoveryKey)
  await page.click('[data-test="unlock-submit"]')
  await page.waitForSelector('[data-test-crumb]', { timeout: 15_000 })
  // Elle a survécu au changement de mot de passe : c'est l'intérêt de la
  // clé encapsulée, la DEK n'a jamais bougé.
  check('la clé de secours ouvre le coffre', (await crumbs(page)).at(-1), 'Backup BDD')
  await shot('p9-06-cle-de-secours-ok')

  // — Désactivation : retour au clair —
  await pickInAppMenu(page, 'Sécurité')
  await page.click('[data-test="open-disable"]')
  await page.waitForTimeout(200)
  await page.fill('[data-test="vault-settings"] input >> nth=0', NEXT)
  await page.click('[data-test="confirm-disable"]')
  await page.waitForTimeout(3000)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  check('le cadenas disparaît', await count(page, '[data-test="vault-badge"]'), 0)

  await close()
}

check('vault.json est supprimé', exists('vault.json'), false)
check('data.json est de nouveau en clair', readFile('data.json').includes(SECRET), true)

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} vérifications passées`)
if (failed.length) {
  for (const f of failed) console.log(`  ECHEC ${f.label}: attendu ${JSON.stringify(f.expected)}`)
  process.exit(1)
}
process.exit(0)
