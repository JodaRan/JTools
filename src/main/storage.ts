import { app } from 'electron'
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
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

function storageDir(): string {
  const dir = join(app.getPath('userData'), 'JTools')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function filePath(name: StoreName): string {
  return join(storageDir(), FILES[name])
}

/**
 * Lecture tolérante : un fichier absent ou corrompu retombe sur les valeurs
 * par défaut plutôt que d'empêcher le démarrage. Le fichier illisible est
 * conservé en `.corrupt` pour inspection.
 */
export async function readStore(name: StoreName): Promise<unknown> {
  const path = filePath(name)
  if (!existsSync(path)) return DEFAULTS[name]()
  try {
    return JSON.parse(await readFile(path, 'utf-8'))
  } catch {
    try {
      renameSync(path, `${path}.corrupt`)
    } catch {
      /* le fichier reste en place : on repart quand même sur les défauts */
    }
    return DEFAULTS[name]()
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
  const path = filePath(name)
  const tmp = `${path}.tmp`
  writeFileSync(tmp, contents, 'utf-8')
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

export { storageDir }
