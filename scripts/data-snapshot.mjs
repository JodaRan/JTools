/**
 * Sauvegarde et restauration du stockage réel de JTools.
 *
 * Les scripts de vérification tournent depuis dans un profil Electron isolé et
 * ne peuvent plus toucher à ce dossier — c'est la vraie protection. Ce script
 * est le filet de sécurité manuel : un instantané à prendre avant une
 * manipulation risquée, et de quoi revenir en arrière.
 *
 * Usage :
 *   node scripts/data-snapshot.mjs save            prend un instantané daté
 *   node scripts/data-snapshot.mjs list            liste les instantanés
 *   node scripts/data-snapshot.mjs restore <nom>   restaure un instantané
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

const REAL_STORAGE = path.join(process.env.APPDATA ?? '', 'jtools', 'JTools')

/**
 * Les instantanés vivent hors du dépôt : ils contiennent vos données, et le
 * coffre ne les protège que s'il était actif au moment de la copie.
 */
const SNAPSHOTS = path.join(
  process.env.LOCALAPPDATA ?? process.env.APPDATA ?? '',
  'JTools-snapshots'
)

const FILES = ['data.json', 'history.json', 'ui.json', 'vault.json']

const [command, argument] = process.argv.slice(2)

function save() {
  if (!fs.existsSync(REAL_STORAGE)) {
    console.error(`Rien à sauvegarder : ${REAL_STORAGE} n'existe pas.`)
    process.exit(1)
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const target = path.join(SNAPSHOTS, stamp)
  fs.mkdirSync(target, { recursive: true })

  let copied = 0
  for (const name of FILES) {
    const from = path.join(REAL_STORAGE, name)
    if (!fs.existsSync(from)) continue
    fs.copyFileSync(from, path.join(target, name))
    copied += 1
  }

  console.log(`Instantané « ${stamp} » : ${copied} fichier(s).`)
  console.log(target)

  const data = path.join(target, 'data.json')
  if (fs.existsSync(data)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(data, 'utf-8'))
      if (parsed.jtools === 'encrypted') {
        console.log('Contenu chiffré : il faudra la passphrase pour le relire.')
      } else {
        console.log(
          `${parsed.projects?.length ?? 0} projet(s), ` +
            `${parsed.sequences?.length ?? 0} séquence(s), ` +
            `${parsed.lines?.length ?? 0} ligne(s) — en clair.`
        )
      }
    } catch {
      console.log('data.json illisible : copié tel quel.')
    }
  }
}

function list() {
  if (!fs.existsSync(SNAPSHOTS)) {
    console.log('Aucun instantané.')
    return
  }
  const entries = fs.readdirSync(SNAPSHOTS).sort().reverse()
  if (entries.length === 0) {
    console.log('Aucun instantané.')
    return
  }
  console.log(`Instantanés dans ${SNAPSHOTS} :`)
  for (const name of entries) {
    const files = fs.readdirSync(path.join(SNAPSHOTS, name))
    console.log(`  ${name}  (${files.join(', ')})`)
  }
}

function restore(name) {
  if (!name) {
    console.error('Précisez l’instantané à restaurer. `list` les affiche.')
    process.exit(1)
  }
  const source = path.join(SNAPSHOTS, name)
  if (!fs.existsSync(source)) {
    console.error(`Instantané introuvable : ${source}`)
    process.exit(1)
  }

  // On ne remplace jamais sans garder ce qu'on écrase.
  if (fs.existsSync(REAL_STORAGE)) {
    console.log('Instantané de l’état courant avant remplacement :')
    save()
  }

  fs.mkdirSync(REAL_STORAGE, { recursive: true })
  let restored = 0
  for (const file of fs.readdirSync(source)) {
    fs.copyFileSync(path.join(source, file), path.join(REAL_STORAGE, file))
    restored += 1
  }
  console.log(`\n${restored} fichier(s) restauré(s) dans ${REAL_STORAGE}.`)
  console.log('JTools doit être fermé pendant l’opération, puis relancé.')
}

if (command === 'save') save()
else if (command === 'list') list()
else if (command === 'restore') restore(argument)
else {
  console.log('Usage : node scripts/data-snapshot.mjs save | list | restore <nom>')
  process.exit(1)
}
