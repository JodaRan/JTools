import {
  SCHEMA_VERSION,
  defaultData,
  defaultHistory,
  defaultUi,
  type DataFile,
  type HistoryFile,
  type UiFile
} from '@shared/models'

/**
 * Point d'entrée unique pour toute donnée venue du disque ou d'une sauvegarde
 * collée à la main : on ne fait jamais confiance à la forme reçue.
 *
 * Ajouter une version : incrémenter SCHEMA_VERSION dans `shared/models.ts` et
 * enchaîner la transformation ici, de la version lue jusqu'à la courante.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])

export function migrateData(input: unknown): DataFile {
  if (!isRecord(input)) return defaultData()
  return {
    version: SCHEMA_VERSION,
    projects: asArray(input.projects),
    sequences: asArray(input.sequences),
    lines: asArray(input.lines)
  }
}

export function migrateHistory(input: unknown): HistoryFile {
  if (!isRecord(input)) return defaultHistory()
  return {
    version: SCHEMA_VERSION,
    entries: asArray(input.entries)
  }
}

export function migrateUi(input: unknown): UiFile {
  const base = defaultUi()
  if (!isRecord(input)) return base
  return {
    ...base,
    ...input,
    version: SCHEMA_VERSION,
    window: { ...base.window, ...(isRecord(input.window) ? input.window : {}) },
    explorer: { ...base.explorer, ...(isRecord(input.explorer) ? input.explorer : {}) },
    sidebar: { ...base.sidebar, ...(isRecord(input.sidebar) ? input.sidebar : {}) },
    tabs: asArray(input.tabs)
  } as UiFile
}

/** Vrai si l'objet ressemble à une sauvegarde JTools exploitable. */
export function looksLikeBackup(input: unknown): boolean {
  return isRecord(input) && input.app === 'JTools' && isRecord(input.data)
}
