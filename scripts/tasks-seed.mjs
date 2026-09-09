/**
 * Reprise en masse des sauvegardes de l'ancien gestionnaire de tâches, dans le
 * stockage réel de JTools.
 *
 * L'interface sait déjà le faire (Outils › Tâches › « Reprendre d'anciennes
 * sauvegardes ») ; ce script rend le même service en une commande, pour la
 * reprise initiale. Il partage exactement le code de conversion — la lecture
 * du format d'origine n'existe qu'à un seul endroit, `lib/legacy.ts`, qu'on
 * compile à la volée plutôt que de le recopier ici.
 *
 * Usage :
 *   node scripts/tasks-seed.mjs [dossier]     reprend (défaut : ./saves)
 *   node scripts/tasks-seed.mjs --dry [dossier]   montre sans rien écrire
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const APP_DIR = path.resolve(import.meta.dirname, '..')
const STORAGE = path.join(process.env.APPDATA ?? '', 'jtools', 'JTools')
const DATA = path.join(STORAGE, 'data.json')

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const SAVES = path.resolve(args.find((arg) => !arg.startsWith('--')) ?? path.join(APP_DIR, 'saves'))

/** Compile `lib/legacy.ts` en module chargeable, alias compris. */
async function loadLegacy() {
  const require = createRequire(import.meta.url)
  const esbuild = require(createRequire(require.resolve('vite')).resolve('esbuild'))
  const outfile = path.join(os.tmpdir(), `jtools-legacy-${process.pid}.mjs`)

  await esbuild.build({
    entryPoints: [path.join(APP_DIR, 'src/renderer/src/lib/legacy.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    logLevel: 'silent',
    alias: {
      '@': path.join(APP_DIR, 'src/renderer/src'),
      '@shared': path.join(APP_DIR, 'src/shared')
    }
  })

  const module = await import(pathToFileURL(outfile).href)
  fs.rmSync(outfile, { force: true })
  return module
}

const { parseLegacyBoard, planImport, buildImport } = await loadLegacy()

// — Lecture des sauvegardes —

if (!fs.existsSync(SAVES)) {
  console.error(`Rien à reprendre : ${SAVES} n'existe pas.`)
  process.exit(1)
}

const candidates = fs.existsSync(path.join(SAVES, 'data.json'))
  ? [{ name: path.basename(SAVES), file: path.join(SAVES, 'data.json') }]
  : fs
      .readdirSync(SAVES, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ name: entry.name, file: path.join(SAVES, entry.name, 'data.json') }))
      .filter((entry) => fs.existsSync(entry.file))

const sources = []
for (const entry of candidates) {
  const legacy = parseLegacyBoard(JSON.parse(fs.readFileSync(entry.file, 'utf-8')))
  if (legacy) sources.push({ name: entry.name, legacy })
  else console.warn(`ignoré (format inconnu) : ${entry.file}`)
}

if (sources.length === 0) {
  console.error(`Aucune sauvegarde exploitable sous ${SAVES}.`)
  process.exit(1)
}

const plans = planImport(sources)

console.log(`Sauvegardes lues depuis ${SAVES} :`)
for (const plan of plans) {
  console.log(`  ${plan.projectName}`)
  for (const board of plan.boards) {
    console.log(`    ${board.name} — ${board.legacy.tasks.length} tâche(s)`)
  }
}

// Un essai à blanc ne lit rien du stockage : il vaut aussi coffre actif.
if (dry) {
  const preview = buildImport('tasks', plans)
  console.log(
    `\n(--dry) ${preview.projects.length} projet(s), ${preview.sequences.length} tableau(x), ` +
      `${preview.tasks.length} tâche(s) seraient ajoutés.`
  )
  process.exit(0)
}

// — Écriture dans le stockage réel —

if (!fs.existsSync(DATA)) {
  console.error(`\n${DATA} est introuvable : lancez JTools au moins une fois.`)
  process.exit(1)
}

const current = JSON.parse(fs.readFileSync(DATA, 'utf-8'))

/**
 * Coffre actif, le fichier est chiffré et ce script n'a pas la clé — c'est
 * voulu. La reprise passe alors par l'interface, qui, elle, l'a.
 */
if (current.jtools === 'encrypted') {
  console.error(
    '\nLe stockage est chiffré : reprenez depuis l’application' +
      '\n(Outils › Tâches › « Reprendre d’anciennes sauvegardes »).'
  )
  process.exit(1)
}

const existing = Array.isArray(current.projects)
  ? current.projects.filter((project) => project.toolId === 'tasks').length
  : 0

const build = buildImport('tasks', plans, { projectOrderStart: existing })

// Filet : l'état d'avant reste à côté, daté.
const backup = `${DATA}.avant-reprise-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`
fs.copyFileSync(DATA, backup)

const next = {
  ...current,
  version: 4,
  projects: [...(current.projects ?? []), ...build.projects],
  sequences: [...(current.sequences ?? []), ...build.sequences],
  lines: current.lines ?? [],
  boards: [...(current.boards ?? []), ...build.boards],
  columns: [...(current.columns ?? []), ...build.columns],
  tasks: [...(current.tasks ?? []), ...build.tasks]
}

fs.writeFileSync(DATA, JSON.stringify(next, null, 2), 'utf-8')

console.log(
  `\nRepris : ${build.projects.length} projet(s), ${build.sequences.length} tableau(x), ` +
    `${build.tasks.length} tâche(s).`
)
console.log(`Sauvegarde de l'état précédent : ${backup}`)
console.log('JTools doit être fermé pendant l’opération, sinon il réécrira le fichier.')
