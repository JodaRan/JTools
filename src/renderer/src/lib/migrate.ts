import {
  SCHEMA_VERSION,
  defaultData,
  defaultHistory,
  defaultUi,
  type DataFile,
  type HistoryFile,
  type Line,
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

/**
 * v1 → v2 : la ligne gagne `masked`. Les fichiers d'avant n'ont pas le champ ;
 * on le pose à `false` plutôt que de laisser un `undefined` traverser l'app,
 * où il se comporterait comme « non masqué » mais casserait tout `toggle`.
 */
const normalizeLine = (input: unknown): Line => {
  const line = (isRecord(input) ? input : {}) as Partial<Line>
  return {
    ...(line as Line),
    hidden: line.hidden === true,
    masked: line.masked === true,
    comment: typeof line.comment === 'string' ? line.comment : ''
  }
}

export function migrateData(input: unknown): DataFile {
  if (!isRecord(input)) return defaultData()
  return {
    version: SCHEMA_VERSION,
    projects: asArray(input.projects),
    sequences: asArray(input.sequences),
    lines: asArray<unknown>(input.lines).map(normalizeLine)
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
    split: { ...base.split, ...(isRecord(input.split) ? input.split : {}) },
    // v2 → v3 : réglages du coffre.
    security: { ...base.security, ...(isRecord(input.security) ? input.security : {}) },
    tabs: asArray(input.tabs)
  } as UiFile
}

/** Vrai si l'objet ressemble à une sauvegarde JTools exploitable. */
export function looksLikeBackup(input: unknown): boolean {
  return isRecord(input) && input.app === 'JTools' && isRecord(input.data)
}
