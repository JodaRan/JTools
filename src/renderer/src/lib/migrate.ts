import {
  PRIORITIES,
  ESTIMATES,
  SCHEMA_VERSION,
  UNASSIGNED,
  defaultData,
  defaultHistory,
  defaultUi,
  type Board,
  type DataFile,
  type Estimate,
  type HistoryFile,
  type Line,
  type Priority,
  type Task,
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


/**
 * v3 → v4 : l'outil « Tâches ». Un fichier d'avant n'a ni tableaux, ni
 * colonnes, ni tâches — `asArray` les rend vides, et rien d'autre ne bouge.
 *
 * Une tâche venue d'une sauvegarde bricolée à la main peut, elle, porter
 * n'importe quoi : priorité inconnue, assigné absent, estimation fantaisiste.
 * On borne chaque champ ici plutôt que de laisser l'interface se débrouiller.
 */
const normalizeTask = (input: unknown): Task => {
  const task = (isRecord(input) ? input : {}) as Partial<Task>
  const priority = task.priority as Priority
  const estimate = task.estimate as Estimate
  return {
    ...(task as Task),
    title: typeof task.title === 'string' ? task.title : '',
    description: typeof task.description === 'string' ? task.description : '',
    assignee: typeof task.assignee === 'string' && task.assignee ? task.assignee : UNASSIGNED,
    priority: PRIORITIES.includes(priority) ? priority : 'medium',
    estimate: estimate === '' || ESTIMATES.includes(estimate as never) ? estimate : '',
    date: typeof task.date === 'string' ? task.date : '',
    dueDate: typeof task.dueDate === 'string' ? task.dueDate : '',
    statusChangedAt: typeof task.statusChangedAt === 'string' ? task.statusChangedAt : '',
    order: typeof task.order === 'number' ? task.order : 0
  }
}

const normalizeBoard = (input: unknown): Board => {
  const board = (isRecord(input) ? input : {}) as Partial<Board>
  const assignees = Array.isArray(board.assignees)
    ? board.assignees.filter((name): name is string => typeof name === 'string')
    : []
  // « Non assigné » ouvre toujours la liste : c'est la valeur par défaut.
  return {
    ...(board as Board),
    assignees: [UNASSIGNED, ...assignees.filter((name) => name !== UNASSIGNED)]
  }
}

export function migrateData(input: unknown): DataFile {
  if (!isRecord(input)) return defaultData()
  return {
    version: SCHEMA_VERSION,
    projects: asArray(input.projects),
    sequences: asArray(input.sequences),
    lines: asArray<unknown>(input.lines).map(normalizeLine),
    boards: asArray<unknown>(input.boards).map(normalizeBoard),
    columns: asArray(input.columns),
    tasks: asArray<unknown>(input.tasks).map(normalizeTask)
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
