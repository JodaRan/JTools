import {
  PRIORITIES,
  ESTIMATES,
  SCHEMA_VERSION,
  UNASSIGNED,
  defaultData,
  defaultHistory,
  defaultUi,
  QUESTION_KINDS,
  type Board,
  type DataFile,
  type DrillAnswer,
  type DrillRun,
  type DrillSet,
  type DrillType,
  type Estimate,
  type HistoryFile,
  type Line,
  type Priority,
  type Question,
  type QuestionKind,
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

/**
 * v4 → v5 : l'outil « Exercices ». Une question vient d'un CSV, donc de
 * l'extérieur : chaque champ est borné ici, sinon un fichier bricolé à la
 * main ferait afficher `undefined` dans l'énoncé ou casserait la correction.
 */
const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

const normalizeQuestion = (input: unknown): Question => {
  const question = (isRecord(input) ? input : {}) as Partial<Question>
  const kind = question.kind as QuestionKind
  const choices = asStrings(question.choices)
  return {
    ...(question as Question),
    // Sans options, un choix ne se pose pas : la question redevient numérique.
    kind: QUESTION_KINDS.includes(kind) && (kind !== 'choice' || choices.length > 0)
      ? kind
      : 'number',
    prompt: text(question.prompt),
    description: text(question.description),
    choices,
    answer: text(question.answer),
    explanation: text(question.explanation),
    lesson: text(question.lesson),
    lessonUrl: text(question.lessonUrl),
    order: typeof question.order === 'number' ? question.order : 0
  }
}

const normalizeAnswers = (value: unknown): DrillAnswer[] =>
  Array.isArray(value)
    ? value.filter(isRecord).map((item) => ({
        questionId: text(item.questionId),
        value: text(item.value),
        correct: item.correct === true,
        at: text(item.at)
      }))
    : []

const normalizeSet = (input: unknown): DrillSet => {
  const set = (isRecord(input) ? input : {}) as Partial<DrillSet>
  return { ...(set as DrillSet), answers: normalizeAnswers(set.answers) }
}

const normalizeRun = (input: unknown): DrillRun => {
  const run = (isRecord(input) ? input : {}) as Partial<DrillRun>
  const answers = normalizeAnswers(run.answers)
  return {
    ...(run as DrillRun),
    answers,
    answered: typeof run.answered === 'number' ? run.answered : answers.length,
    correct:
      typeof run.correct === 'number'
        ? run.correct
        : answers.filter((answer) => answer.correct).length,
    total: typeof run.total === 'number' ? run.total : answers.length
  }
}

const normalizeType = (input: unknown): DrillType => {
  const type = (isRecord(input) ? input : {}) as Partial<DrillType>
  return { ...(type as DrillType), spec: text(type.spec) }
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
    tasks: asArray<unknown>(input.tasks).map(normalizeTask),
    drillTypes: asArray<unknown>(input.drillTypes).map(normalizeType),
    drillSets: asArray<unknown>(input.drillSets).map(normalizeSet),
    questions: asArray<unknown>(input.questions).map(normalizeQuestion),
    drillRuns: asArray<unknown>(input.drillRuns).map(normalizeRun)
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
