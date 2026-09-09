/**
 * Commandes de l'outil « Tâches ».
 *
 * Même règle que pour les séquences : toute mutation passe par une commande
 * qui sait se défaire. C'est ce qui rend Ctrl+Z global, et ce qui alimente le
 * journal — un déplacement de carte s'annule comme une frappe au clavier.
 *
 * Un tableau EST une séquence : il en porte l'identifiant, ce qui lui donne
 * gratuitement l'onglet, le fil d'Ariane et la vue côte à côte.
 */
import { useDataStore } from '@/stores/data'
import { newId, now } from '@/lib/id'
import { shortLabel as short, type Command, type CommandFocus } from '@/lib/commands'
import { buildImport, type ImportPlan } from '@/lib/legacy'
import {
  DEFAULT_COLUMNS,
  UNASSIGNED,
  type Board,
  type Column,
  type Estimate,
  type Priority,
  type Sequence,
  type Task
} from '@shared/models'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

/** Le jour courant, tel qu'on l'écrit dans une tâche : `YYYY-MM-DD`, en local. */
export const today = (): string => {
  const date = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  urgent: 'Urgente',
  high: 'Haute',
  medium: 'Moyenne',
  low: 'Basse'
}

export const ESTIMATE_LABELS: Record<Exclude<Estimate, ''>, string> = {
  xs: 'XS',
  s: 'S',
  m: 'M',
  l: 'L',
  xl: 'XL'
}

/** Reconstitue le chemin d'un tableau, pour que l'annulation y ramène. */
function focusForBoard(boardId: string, taskId?: string): CommandFocus | undefined {
  const data = useDataStore()
  const sequence = data.sequence(boardId)
  if (!sequence) return undefined
  const project = data.project(sequence.projectId)
  if (!project) return undefined
  return { toolId: project.toolId, projectId: project.id, sequenceId: boardId, taskId }
}

const titleOf = (id: string): string => {
  const data = useDataStore()
  return short(data.task(id)?.title ?? '')
}

// —————————————————————————————— Tableaux ——————————————————————————————

/**
 * Crée un tableau : la séquence qui lui sert d'onglet, son enregistrement
 * propre et ses quatre colonnes de départ, en une seule action annulable.
 */
export function createBoard(projectId: string, name: string): Command {
  const data = useDataStore()
  const stamp = now()
  const sequence: Sequence = {
    id: newId(),
    projectId,
    name: name.trim() || 'Tableau sans nom',
    description: '',
    order: data.sequencesOfProject(projectId).length,
    createdAt: stamp,
    updatedAt: stamp
  }
  const board: Board = { id: sequence.id, assignees: [UNASSIGNED] }
  const columns: Column[] = DEFAULT_COLUMNS.map((label, index) => ({
    id: newId(),
    boardId: board.id,
    name: label,
    order: index,
    createdAt: stamp,
    updatedAt: stamp
  }))
  const project = data.project(projectId)

  return {
    label: `Créer le tableau « ${short(sequence.name)} »`,
    action: 'create',
    entityType: 'sequence',
    entityId: sequence.id,
    sequenceId: sequence.id,
    focus: project
      ? { toolId: project.toolId, projectId, sequenceId: sequence.id }
      : undefined,
    after: clone({ sequence, board, columns }),
    do: () => {
      data.insertSequence(clone(sequence))
      data.insertBoard(clone(board))
      for (const column of columns) data.insertColumn(clone(column))
    },
    undo: () => {
      for (const column of columns) data.removeColumn(column.id)
      data.removeBoard(board.id)
      data.removeSequence(sequence.id)
    }
  }
}

/**
 * Répare un tableau ouvert sans enregistrement propre — sauvegarde importée à
 * la main, séquence créée par l'autre outil puis déplacée. Sans colonnes, la
 * vue n'aurait nulle part où poser une tâche.
 */
export function ensureBoard(boardId: string): Command {
  const data = useDataStore()
  const stamp = now()
  const board: Board = { id: boardId, assignees: [UNASSIGNED] }
  const missing = data.columnsOfBoard(boardId).length === 0
  const columns: Column[] = missing
    ? DEFAULT_COLUMNS.map((label, index) => ({
        id: newId(),
        boardId,
        name: label,
        order: index,
        createdAt: stamp,
        updatedAt: stamp
      }))
    : []

  return {
    label: 'Préparer le tableau',
    action: 'create',
    entityType: 'board',
    entityId: boardId,
    sequenceId: boardId,
    focus: focusForBoard(boardId),
    do: () => {
      if (!data.board(boardId)) data.insertBoard(clone(board))
      for (const column of columns) data.insertColumn(clone(column))
    },
    undo: () => {
      for (const column of columns) data.removeColumn(column.id)
    }
  }
}

export function addAssignee(boardId: string, name: string): Command {
  const data = useDataStore()
  const previous = clone(data.board(boardId)?.assignees ?? [UNASSIGNED])
  const next = [...previous, name.trim()]
  return {
    label: `Ajouter l'acteur « ${short(name)} »`,
    action: 'update',
    entityType: 'board',
    entityId: boardId,
    sequenceId: boardId,
    focus: focusForBoard(boardId),
    before: previous,
    after: next,
    do: () => data.patchBoard(boardId, { assignees: next }),
    undo: () => data.patchBoard(boardId, { assignees: previous })
  }
}

/** Retirer un acteur ne supprime rien : ses tâches repassent en « Non assigné ». */
export function removeAssignee(boardId: string, name: string): Command {
  const data = useDataStore()
  const previous = clone(data.board(boardId)?.assignees ?? [UNASSIGNED])
  const next = previous.filter((item) => item !== name)
  const orphans = data.tasksOfBoard(boardId).filter((task) => task.assignee === name)
  const ids = orphans.map((task) => task.id)

  return {
    label: `Retirer l'acteur « ${short(name)} »`,
    action: 'update',
    entityType: 'board',
    entityId: boardId,
    sequenceId: boardId,
    focus: focusForBoard(boardId),
    before: previous,
    after: next,
    do: () => {
      data.patchBoard(boardId, { assignees: next })
      for (const id of ids) data.patchTask(id, { assignee: UNASSIGNED })
    },
    undo: () => {
      data.patchBoard(boardId, { assignees: previous })
      for (const id of ids) data.patchTask(id, { assignee: name })
    }
  }
}

// —————————————————————————————— Colonnes ——————————————————————————————

export function createColumn(boardId: string, name: string, at?: number): Command {
  const data = useDataStore()
  const stamp = now()
  const column: Column = {
    id: newId(),
    boardId,
    name: name.trim() || 'Sans titre',
    order: at ?? data.columnsOfBoard(boardId).length,
    createdAt: stamp,
    updatedAt: stamp
  }
  return {
    label: `Créer la colonne « ${short(column.name)} »`,
    action: 'create',
    entityType: 'column',
    entityId: column.id,
    sequenceId: boardId,
    focus: focusForBoard(boardId),
    after: clone(column),
    do: () => data.insertColumn(clone(column), at),
    undo: () => data.removeColumn(column.id)
  }
}

export function renameColumn(id: string, name: string): Command {
  const data = useDataStore()
  const column = data.column(id)
  const previous = column?.name ?? ''
  return {
    label: `Renommer la colonne en « ${short(name)} »`,
    action: 'update',
    entityType: 'column',
    entityId: id,
    sequenceId: column?.boardId ?? null,
    focus: focusForBoard(column?.boardId ?? ''),
    before: previous,
    after: name,
    coalesceKey: `column-name:${id}`,
    do: () => data.patchColumn(id, { name }),
    undo: () => data.patchColumn(id, { name: previous })
  }
}

/** Supprimer une colonne emporte ses tâches — et l'annulation les ramène. */
export function deleteColumn(id: string): Command {
  const data = useDataStore()
  const column = clone(data.column(id)!)
  const tasks = clone(data.tasksOfColumn(id))
  const index = data.columnsOfBoard(column.boardId).findIndex((item) => item.id === id)

  return {
    label: `Supprimer la colonne « ${short(column.name)} »`,
    action: 'delete',
    entityType: 'column',
    entityId: id,
    sequenceId: column.boardId,
    focus: focusForBoard(column.boardId),
    before: { column, tasks },
    do: () => {
      for (const task of tasks) data.removeTask(task.id)
      data.removeColumn(id)
    },
    undo: () => {
      data.insertColumn(clone(column), index)
      for (const task of tasks) data.insertTask(clone(task))
    }
  }
}

export function reorderColumns(boardId: string, orderedIds: string[]): Command {
  const data = useDataStore()
  const previous = data.columnsOfBoard(boardId).map((column) => column.id)
  return {
    label: 'Réordonner les colonnes',
    action: 'reorder',
    entityType: 'column',
    entityId: boardId,
    sequenceId: boardId,
    focus: focusForBoard(boardId),
    before: previous,
    after: orderedIds,
    do: () => data.reorderColumns(boardId, orderedIds),
    undo: () => data.reorderColumns(boardId, previous)
  }
}

// ——————————————————————————————— Tâches ———————————————————————————————

export function createTask(
  boardId: string,
  columnId: string,
  title: string,
  patch: Partial<Task> = {}
): Command {
  const data = useDataStore()
  const stamp = now()
  const task: Task = {
    id: newId(),
    boardId,
    columnId,
    title: title.trim(),
    description: '',
    assignee: UNASSIGNED,
    priority: 'medium',
    estimate: '',
    date: today(),
    dueDate: '',
    statusChangedAt: '',
    order: 0,
    createdAt: stamp,
    updatedAt: stamp,
    ...patch
  }
  return {
    label: task.title ? `Ajouter la tâche « ${short(task.title)} »` : 'Ajouter une tâche',
    action: 'create',
    entityType: 'task',
    entityId: task.id,
    sequenceId: boardId,
    focus: focusForBoard(boardId, task.id),
    after: clone(task),
    do: () => data.insertTask(clone(task)),
    undo: () => data.removeTask(task.id)
  }
}

export function deleteTask(id: string): Command {
  const data = useDataStore()
  const task = clone(data.task(id)!)
  const index = data.tasksOfGroup(task.columnId, task.priority).findIndex((t) => t.id === id)
  return {
    label: `Supprimer la tâche « ${short(task.title)} »`,
    action: 'delete',
    entityType: 'task',
    entityId: id,
    sequenceId: task.boardId,
    focus: focusForBoard(task.boardId, id),
    before: task,
    do: () => data.removeTask(id),
    undo: () => data.insertTask(clone(task), index)
  }
}

export function duplicateTask(id: string): Command {
  const data = useDataStore()
  const source = data.task(id)!
  const index = data.tasksOfGroup(source.columnId, source.priority).findIndex((t) => t.id === id)
  const copy: Task = {
    ...clone(source),
    id: newId(),
    title: `${source.title} (copie)`,
    createdAt: now(),
    updatedAt: now()
  }
  return {
    label: `Dupliquer « ${short(source.title)} »`,
    action: 'create',
    entityType: 'task',
    entityId: copy.id,
    sequenceId: copy.boardId,
    focus: focusForBoard(copy.boardId, copy.id),
    after: clone(copy),
    do: () => data.insertTask(clone(copy), index + 1),
    undo: () => data.removeTask(copy.id)
  }
}

/**
 * Modification d'un champ simple. `coalesce` replie une rafale de frappe en
 * une seule entrée annulable, comme sur une ligne de séquence.
 */
function patchTaskCommand(
  id: string,
  patch: Partial<Task>,
  label: string,
  coalesceKey?: string
): Command {
  const data = useDataStore()
  const task = data.task(id)!
  const previous = Object.fromEntries(
    Object.keys(patch).map((key) => [key, clone(task[key as keyof Task])])
  ) as Partial<Task>

  return {
    label,
    action: 'update',
    entityType: 'task',
    entityId: id,
    sequenceId: task.boardId,
    focus: focusForBoard(task.boardId, id),
    before: previous,
    after: clone(patch),
    coalesceKey,
    do: () => data.patchTask(id, patch),
    undo: () => data.patchTask(id, previous)
  }
}

export const renameTask = (id: string, title: string): Command =>
  patchTaskCommand(id, { title }, `Renommer en « ${short(title)} »`, `task-title:${id}`)

export const setTaskDescription = (id: string, description: string): Command =>
  patchTaskCommand(
    id,
    { description },
    `Décrire « ${titleOf(id)} »`,
    `task-description:${id}`
  )

export const setTaskAssignee = (id: string, assignee: string): Command =>
  patchTaskCommand(id, { assignee }, `Assigner « ${titleOf(id)} » à ${short(assignee, 20)}`)

export const setTaskEstimate = (id: string, estimate: Estimate): Command =>
  patchTaskCommand(
    id,
    { estimate },
    estimate
      ? `Estimer « ${titleOf(id)} » à ${ESTIMATE_LABELS[estimate]}`
      : `Retirer l'estimation de « ${titleOf(id)} »`
  )

export const setTaskDate = (id: string, date: string): Command =>
  patchTaskCommand(id, { date }, `Dater « ${titleOf(id)} »`)

export const setTaskDueDate = (id: string, dueDate: string): Command =>
  patchTaskCommand(
    id,
    { dueDate },
    dueDate ? `Échéance de « ${titleOf(id)} »` : `Retirer l'échéance de « ${titleOf(id)} »`
  )

/**
 * Change la priorité. C'est un changement de groupe : la tâche rejoint la fin
 * de sa nouvelle famille, et l'annulation remet l'ancienne dans l'ordre exact
 * où elle était — le rang seul ne suffirait pas à le garantir.
 */
export function setTaskPriority(id: string, priority: Priority): Command {
  const data = useDataStore()
  const task = data.task(id)!
  const from = task.priority
  const columnId = task.columnId
  const before = data.tasksOfGroup(columnId, from).map((item) => item.id)

  return {
    label: `Priorité « ${PRIORITY_LABELS[priority]} » pour « ${short(task.title)} »`,
    action: 'update',
    entityType: 'task',
    entityId: id,
    sequenceId: task.boardId,
    focus: focusForBoard(task.boardId, id),
    before: from,
    after: priority,
    do: () =>
      data.patchTask(id, { priority, order: data.tasksOfGroup(columnId, priority).length }),
    undo: () => {
      data.patchTask(id, { priority: from })
      data.reorderTasks(columnId, from, before)
    }
  }
}

/**
 * Déplacement d'une carte d'une colonne à l'autre, à priorité constante.
 *
 * `orderedIds` est l'ordre du groupe d'arrivée tel que le glisser-déposer l'a
 * laissé. La date de changement de statut n'est posée qu'ici : c'est le seul
 * endroit où le statut change vraiment.
 */
export function moveTask(id: string, toColumnId: string, orderedIds: string[]): Command {
  const data = useDataStore()
  const task = data.task(id)!
  const from = task.columnId
  const priority = task.priority
  const stampBefore = task.statusChangedAt
  const stamp = now()
  const sourceBefore = data.tasksOfGroup(from, priority).map((item) => item.id)
  const targetBefore = data.tasksOfGroup(toColumnId, priority).map((item) => item.id)
  const column = data.column(toColumnId)

  return {
    label: `Déplacer « ${short(task.title)} » vers « ${short(column?.name ?? '')} »`,
    action: 'move',
    entityType: 'task',
    entityId: id,
    sequenceId: task.boardId,
    focus: focusForBoard(task.boardId, id),
    before: from,
    after: toColumnId,
    do: () => {
      data.patchTask(id, { columnId: toColumnId, statusChangedAt: stamp })
      data.reorderTasks(toColumnId, priority, orderedIds)
    },
    undo: () => {
      data.patchTask(id, { columnId: from, statusChangedAt: stampBefore })
      data.reorderTasks(from, priority, sourceBefore)
      data.reorderTasks(toColumnId, priority, targetBefore)
    }
  }
}

/** Réordonne un groupe (colonne, priorité) : le seul réarrangement autorisé. */
export function reorderTasks(
  columnId: string,
  priority: Priority,
  orderedIds: string[]
): Command {
  const data = useDataStore()
  const boardId = data.column(columnId)?.boardId ?? null
  const previous = data.tasksOfGroup(columnId, priority).map((item) => item.id)
  return {
    label: 'Réordonner les tâches',
    action: 'reorder',
    entityType: 'task',
    entityId: columnId,
    sequenceId: boardId,
    focus: focusForBoard(boardId ?? ''),
    before: previous,
    after: orderedIds,
    do: () => data.reorderTasks(columnId, priority, orderedIds),
    undo: () => data.reorderTasks(columnId, priority, previous)
  }
}

// ————————————————————————————— Reprise —————————————————————————————

export interface ImportOutcome {
  projects: number
  boards: number
  tasks: number
  /** Premier tableau créé : c'est celui qu'on ouvre après coup. */
  firstBoardId: string | null
  firstProjectId: string | null
}

/**
 * Reprend des sauvegardes de l'ancien outil.
 *
 * Tout se joue en une commande : reprendre six dossiers puis se raviser ne
 * doit coûter qu'un Ctrl+Z. `projectId` cible un projet existant ; sans lui,
 * chaque plan crée le sien.
 */
export function importLegacyBoards(
  toolId: string,
  plans: ImportPlan[],
  projectId?: string
): Command & { outcome: ImportOutcome } {
  const data = useDataStore()
  const { projects, sequences, boards, columns, tasks } = buildImport(toolId, plans, {
    projectId,
    projectOrderStart: data.projectsOfTool(toolId).length
  })

  const label =
    plans.length === 1 && plans[0].boards.length === 1
      ? `Importer le tableau « ${short(plans[0].boards[0].name)} »`
      : `Importer ${sequences.length} tableaux (${tasks.length} tâches)`

  return {
    label,
    action: 'import',
    entityType: 'sequence',
    entityId: sequences[0]?.id ?? '',
    sequenceId: sequences[0]?.id ?? null,
    focus: {
      toolId,
      projectId: projectId ?? projects[0]?.id,
      sequenceId: sequences[0]?.id
    },
    after: { projects: projects.length, boards: sequences.length, tasks: tasks.length },
    outcome: {
      projects: projects.length,
      boards: sequences.length,
      tasks: tasks.length,
      firstBoardId: sequences[0]?.id ?? null,
      firstProjectId: projectId ?? projects[0]?.id ?? null
    },
    do: () => {
      for (const project of projects) data.insertProject(clone(project))
      for (const sequence of sequences) data.insertSequence(clone(sequence))
      for (const board of boards) data.insertBoard(clone(board))
      for (const column of columns) data.insertColumn(clone(column))
      // Les rangs sont déjà denses par groupe : on les pose tels quels.
      data.appendTasks(clone(tasks))
    },
    undo: () => {
      for (const task of tasks) data.removeTask(task.id)
      for (const column of columns) data.removeColumn(column.id)
      for (const board of boards) data.removeBoard(board.id)
      for (const sequence of sequences) data.removeSequence(sequence.id)
      for (const project of projects) data.removeProject(project.id)
    }
  }
}
