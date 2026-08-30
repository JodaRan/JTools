import { app } from 'electron'
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { open, seal, type Sealed } from './crypto'
import { currentKey, isConfigured, isUnlocked } from './vault'
import {
  defaultData,
  defaultHistory,
  defaultUi,
  type DataFile,
  type HistoryFile,
  type UiFile
} from '../shared/models'

export type StoreName = 'data' | 'history' | 'ui'

const FILES: Record<StoreName, string> = {
  data: 'data.json',
  history: 'history.json',
  ui: 'ui.json'
}

const DEFAULTS: Record<StoreName, () => unknown> = {
  data: defaultData,
  history: defaultHistory,
  ui: defaultUi
}

/**
 * `ui.json` reste en clair : le processus principal le lit pour créer la
 * fenêtre à la bonne taille, donc avant même que la passphrase soit demandée.
 * Il ne contient que la géométrie, le thème et des identifiants opaques — les
 * noms d'onglets sont résolus depuis `data.json` au moment de l'affichage.
 */
const ENCRYPTED: ReadonlySet<StoreName> = new Set<StoreName>(['data', 'history'])

/** Enveloppe d'un fichier chiffré. Le marqueur permet de la reconnaître à la lecture. */
interface EncryptedFile extends Sealed {
  jtools: 'encrypted'
  v: 1
}

const isEncrypted = (value: unknown): value is EncryptedFile =>
  typeof value === 'object' &&
  value !== null &&
  (value as EncryptedFile).jtools === 'encrypted'

export type StorageErrorCode = 'locked' | 'undecipherable'

/**
 * Erreur qui doit remonter jusqu'à l'interface plutôt que d'être avalée : dans
 * les deux cas, repartir sur des valeurs par défaut détruirait les données au
 * premier enregistrement.
 */
export class StorageError extends Error {
  constructor(readonly code: StorageErrorCode) {
    super(code)
    this.name = 'StorageError'
  }
}

function storageDir(): string {
  const dir = join(app.getPath('userData'), 'JTools')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function filePath(name: StoreName): string {
  return join(storageDir(), FILES[name])
}

/**
 * Lecture. Un fichier absent retombe sur les valeurs par défaut ; un fichier
 * chiffré qu'on ne sait pas ouvrir lève, au contraire, une erreur franche.
 *
 * Un JSON corrompu et non chiffré est mis de côté en `.corrupt` et remplacé par
 * les défauts — c'est le comportement d'origine, sans risque puisqu'il n'y a
 * rien à récupérer dans un fichier illisible.
 */
export async function readStore(name: StoreName): Promise<unknown> {
  const path = filePath(name)
  if (!existsSync(path)) return DEFAULTS[name]()

  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(path, 'utf-8'))
  } catch {
    try {
      renameSync(path, `${path}.corrupt`)
    } catch {
      /* le fichier reste en place : on repart quand même sur les défauts */
    }
    return DEFAULTS[name]()
  }

  if (!isEncrypted(parsed)) return parsed

  const key = currentKey()
  // Chiffré mais coffre fermé : ce n'est pas une corruption, c'est un verrou.
  if (!key) throw new StorageError('locked')

  try {
    return JSON.parse(open(key, parsed).toString('utf-8'))
  } catch {
    // Mauvaise clé ou fichier altéré. Surtout ne rien écraser.
    throw new StorageError('undecipherable')
  }
}

/**
 * Écriture atomique : on écrit dans un fichier temporaire puis on le renomme,
 * pour qu'une coupure ne laisse jamais un JSON tronqué.
 *
 * Le renderer envoie du JSON déjà sérialisé : ses objets sont des proxies Vue,
 * que le clonage structuré de l'IPC refuse de transporter.
 */
export function writeStore(name: StoreName, contents: string): void {
  // Coffre configuré mais verrouillé : écrire en clair réduirait à néant le
  // chiffrement, écrire du chiffré est impossible sans la clé. On refuse.
  if (ENCRYPTED.has(name) && isConfigured() && !isUnlocked()) {
    throw new StorageError('locked')
  }

  const key = ENCRYPTED.has(name) ? currentKey() : null
  const payload = key
    ? JSON.stringify({ jtools: 'encrypted', v: 1, ...seal(key, contents) } satisfies EncryptedFile)
    : contents

  const path = filePath(name)
  const tmp = `${path}.tmp`
  writeFileSync(tmp, payload, 'utf-8')
  renameSync(tmp, path)
}

export async function readAll(): Promise<{
  data: DataFile
  history: HistoryFile
  ui: UiFile
}> {
  const [data, history, ui] = await Promise.all([
    readStore('data'),
    readStore('history'),
    readStore('ui')
  ])
  return { data: data as DataFile, history: history as HistoryFile, ui: ui as UiFile }
}

/**
 * Lit les fichiers chiffrables en clair, tels qu'ils sont aujourd'hui.
 *
 * Activation et désactivation du coffre suivent la même chorégraphie en trois
 * temps : prendre cet instantané, changer l'état du coffre, puis le réécrire.
 * L'ordre compte — retirer `vault.json` avant d'avoir relu laisserait des
 * fichiers chiffrés sans clé, donc perdus.
 */
export async function snapshotStores(): Promise<Record<StoreName, string>> {
  const snapshot = {} as Record<StoreName, string>
  for (const name of ENCRYPTED) {
    snapshot[name] = JSON.stringify(await readStore(name), null, 2)
  }
  return snapshot
}

/** Réécrit l'instantané avec l'état de coffre courant. */
export function restoreSnapshot(snapshot: Record<StoreName, string>): void {
  for (const name of ENCRYPTED) {
    if (snapshot[name] !== undefined) writeStore(name, snapshot[name])
  }
}

export { storageDir }
