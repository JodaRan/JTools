import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { registerSource, scheduleSave } from '@/lib/persist'
import { now } from '@/lib/id'
import {
  SCHEMA_VERSION,
  defaultData,
  priorityRank,
  type Board,
  type Column,
  type DataFile,
  type Line,
  type Priority,
  type Project,
  type Sequence,
  type Task
} from '@shared/models'

interface Ordered {
  order: number
}

/** Réécrit les rangs en 0..n-1 pour qu'ils restent denses après un déplacement. */
function renumber<T extends Ordered>(items: T[]): void {
  items.forEach((item, index) => {
    item.order = index
  })
}

const byOrder = <T extends Ordered>(items: T[]): T[] =>
  [...items].sort((a, b) => a.order - b.order)

/**
 * Donnée métier pure : projets, séquences, lignes. Les mutations exposées ici
 * sont volontairement bêtes et réversibles — la couche commandes (annulation)
 * et le journal viennent se poser par-dessus.
 */
export const useDataStore = defineStore('data', () => {
  const projects = ref<Project[]>([])
  const sequences = ref<Sequence[]>([])
  const lines = ref<Line[]>([])
  const boards = ref<Board[]>([])
  const columns = ref<Column[]>([])
  const tasks = ref<Task[]>([])

  // — Lectures —
  const projectsOfTool = (toolId: string): Project[] =>
    byOrder(projects.value.filter((p) => p.toolId === toolId))

  const sequencesOfProject = (projectId: string): Sequence[] =>
    byOrder(sequences.value.filter((s) => s.projectId === projectId))

  const linesOfSequence = (sequenceId: string): Line[] =>
    byOrder(lines.value.filter((l) => l.sequenceId === sequenceId))

  const visibleLines = (sequenceId: string): Line[] =>
    linesOfSequence(sequenceId).filter((l) => !l.hidden)

  const hiddenLines = (sequenceId: string): Line[] =>
    linesOfSequence(sequenceId).filter((l) => l.hidden)

  const maskedLines = (sequenceId: string): Line[] =>
    linesOfSequence(sequenceId).filter((l) => l.masked)

  const project = (id: string): Project | undefined => projects.value.find((p) => p.id === id)
  const sequence = (id: string): Sequence | undefined => sequences.value.find((s) => s.id === id)
  const line = (id: string): Line | undefined => lines.value.find((l) => l.id === id)

  // — Lectures « Tâches » —
  const board = (id: string): Board | undefined => boards.value.find((b) => b.id === id)
  const column = (id: string): Column | undefined => columns.value.find((c) => c.id === id)
  const task = (id: string): Task | undefined => tasks.value.find((t) => t.id === id)

  const columnsOfBoard = (boardId: string): Column[] =>
    byOrder(columns.value.filter((c) => c.boardId === boardId))

  const tasksOfBoard = (boardId: string): Task[] =>
    tasks.value.filter((t) => t.boardId === boardId)

  /**
   * Les tâches d'une colonne, dans l'ordre où elles s'affichent : priorité
   * d'abord, puis rang au sein de la priorité. C'est le tri de l'ancien outil,
   * et c'est lui qui justifie qu'on ne réordonne qu'à priorité égale.
   */
  const tasksOfColumn = (columnId: string): Task[] =>
    tasks.value
      .filter((t) => t.columnId === columnId)
      .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.order - b.order)

  /** Le groupe (colonne, priorité) : l'unité que le glisser-déposer manipule. */
  const tasksOfGroup = (columnId: string, priority: Priority): Task[] =>
    byOrder(tasks.value.filter((t) => t.columnId === columnId && t.priority === priority))

  /** Tout ce qui disparaît avec un tableau, et doit revenir avec lui. */
  function descendantsOfBoard(boardId: string): { columns: Column[]; tasks: Task[] } {
    return {
      columns: columns.value.filter((c) => c.boardId === boardId),
      tasks: tasks.value.filter((t) => t.boardId === boardId)
    }
  }

  const counts = computed(() => ({
    projects: projects.value.length,
    sequences: sequences.value.length,
    lines: lines.value.length,
    tasks: tasks.value.length
  }))

  // — Écritures bas niveau —
  // `at` permet de réinsérer un élément à sa place d'origine lors d'une annulation.
  function insertProject(item: Project, at?: number): void {
    projects.value.push(item)
    const siblings = projectsOfTool(item.toolId).filter((p) => p.id !== item.id)
    siblings.splice(at ?? siblings.length, 0, item)
    renumber(siblings)
    touch()
  }

  function insertSequence(item: Sequence, at?: number): void {
    sequences.value.push(item)
    const siblings = sequencesOfProject(item.projectId).filter((s) => s.id !== item.id)
    siblings.splice(at ?? siblings.length, 0, item)
    renumber(siblings)
    touch()
  }

  function insertLine(item: Line, at?: number): void {
    lines.value.push(item)
    const siblings = linesOfSequence(item.sequenceId).filter((l) => l.id !== item.id)
    siblings.splice(at ?? siblings.length, 0, item)
    renumber(siblings)
    touch()
  }

  function removeProject(id: string): void {
    const target = project(id)
    if (!target) return
    projects.value = projects.value.filter((p) => p.id !== id)
    renumber(projectsOfTool(target.toolId))
    touch()
  }

  function removeSequence(id: string): void {
    const target = sequence(id)
    if (!target) return
    sequences.value = sequences.value.filter((s) => s.id !== id)
    renumber(sequencesOfProject(target.projectId))
    touch()
  }

  function removeLine(id: string): void {
    const target = line(id)
    if (!target) return
    lines.value = lines.value.filter((l) => l.id !== id)
    renumber(linesOfSequence(target.sequenceId))
    touch()
  }

  /** Descendants d'un projet, à retirer et à restaurer avec lui. */
  function descendantsOfProject(projectId: string): {
    sequences: Sequence[]
    lines: Line[]
    boards: Board[]
    columns: Column[]
    tasks: Task[]
  } {
    const seqs = sequences.value.filter((s) => s.projectId === projectId)
    const ids = new Set(seqs.map((s) => s.id))
    return {
      sequences: seqs,
      lines: lines.value.filter((l) => ids.has(l.sequenceId)),
      // Un tableau porte l'identifiant de sa séquence : les deux partent ensemble.
      boards: boards.value.filter((b) => ids.has(b.id)),
      columns: columns.value.filter((c) => ids.has(c.boardId)),
      tasks: tasks.value.filter((t) => ids.has(t.boardId))
    }
  }

  function insertBoard(item: Board): void {
    boards.value = [...boards.value.filter((b) => b.id !== item.id), item]
    touch()
  }

  function removeBoard(id: string): void {
    boards.value = boards.value.filter((b) => b.id !== id)
    touch()
  }

  function patchBoard(id: string, patch: Partial<Board>): void {
    const target = board(id)
    if (!target) return
    Object.assign(target, patch)
    touch()
  }

  function insertColumn(item: Column, at?: number): void {
    columns.value.push(item)
    const siblings = columnsOfBoard(item.boardId).filter((c) => c.id !== item.id)
    siblings.splice(at ?? siblings.length, 0, item)
    renumber(siblings)
    touch()
  }

  function removeColumn(id: string): void {
    const target = column(id)
    if (!target) return
    columns.value = columns.value.filter((c) => c.id !== id)
    renumber(columnsOfBoard(target.boardId))
    touch()
  }

  function patchColumn(id: string, patch: Partial<Column>): void {
    const target = column(id)
    if (!target) return
    Object.assign(target, patch, { updatedAt: now() })
    touch()
  }

  /** `at` est un rang dans le groupe (colonne, priorité), pas dans la colonne. */
  function insertTask(item: Task, at?: number): void {
    tasks.value.push(item)
    const siblings = tasksOfGroup(item.columnId, item.priority).filter((t) => t.id !== item.id)
    siblings.splice(at ?? siblings.length, 0, item)
    renumber(siblings)
    touch()
  }

  /** Ajout en bloc de tâches dont les rangs sont déjà denses (reprise, import). */
  function appendTasks(items: Task[]): void {
    tasks.value.push(...items)
    touch()
  }

  function removeTask(id: string): void {
    const target = task(id)
    if (!target) return
    const { columnId, priority } = target
    tasks.value = tasks.value.filter((t) => t.id !== id)
    renumber(tasksOfGroup(columnId, priority))
    touch()
  }

  function patchTask(id: string, patch: Partial<Task>): void {
    const target = task(id)
    if (!target) return
    const from = { columnId: target.columnId, priority: target.priority }
    Object.assign(target, patch, { updatedAt: now() })
    // Changer de colonne ou de priorité, c'est changer de groupe : les deux
    // groupes se renumérotent, sans quoi les rangs se marcheraient dessus.
    if (patch.columnId !== undefined || patch.priority !== undefined) {
      renumber(tasksOfGroup(from.columnId, from.priority))
      renumber(tasksOfGroup(target.columnId, target.priority))
    }
    touch()
  }

  function reorderColumns(boardId: string, orderedIds: string[]): void {
    const index = new Map(orderedIds.map((id, i) => [id, i]))
    for (const item of columns.value) {
      if (item.boardId !== boardId) continue
      const rank = index.get(item.id)
      if (rank !== undefined) item.order = rank
    }
    touch()
  }

  /** Applique un ordre explicite à un groupe (colonne, priorité). */
  function reorderTasks(columnId: string, priority: Priority, orderedIds: string[]): void {
    const index = new Map(orderedIds.map((id, i) => [id, i]))
    for (const item of tasks.value) {
      if (item.columnId !== columnId || item.priority !== priority) continue
      const rank = index.get(item.id)
      if (rank !== undefined) item.order = rank
    }
    touch()
  }

  function patchProject(id: string, patch: Partial<Project>): void {
    const target = project(id)
    if (!target) return
    Object.assign(target, patch, { updatedAt: now() })
    touch()
  }

  function patchSequence(id: string, patch: Partial<Sequence>): void {
    const target = sequence(id)
    if (!target) return
    Object.assign(target, patch, { updatedAt: now() })
    touch()
  }

  function patchLine(id: string, patch: Partial<Line>): void {
    const target = line(id)
    if (!target) return
    Object.assign(target, patch, { updatedAt: now() })
    touch()
  }

  /** Applique un ordre explicite (issu d'un glisser-déposer ou d'une annulation). */
  function reorderLines(sequenceId: string, orderedIds: string[]): void {
    const index = new Map(orderedIds.map((id, i) => [id, i]))
    for (const item of lines.value) {
      if (item.sequenceId !== sequenceId) continue
      const rank = index.get(item.id)
      if (rank !== undefined) item.order = rank
    }
    touch()
  }

  function reorderProjects(toolId: string, orderedIds: string[]): void {
    const index = new Map(orderedIds.map((id, i) => [id, i]))
    for (const item of projects.value) {
      if (item.toolId !== toolId) continue
      const rank = index.get(item.id)
      if (rank !== undefined) item.order = rank
    }
    touch()
  }

  function reorderSequences(projectId: string, orderedIds: string[]): void {
    const index = new Map(orderedIds.map((id, i) => [id, i]))
    for (const item of sequences.value) {
      if (item.projectId !== projectId) continue
      const rank = index.get(item.id)
      if (rank !== undefined) item.order = rank
    }
    touch()
  }

  // — Persistance —
  function serialize(): DataFile {
    return {
      version: SCHEMA_VERSION,
      projects: projects.value,
      sequences: sequences.value,
      lines: lines.value,
      boards: boards.value,
      columns: columns.value,
      tasks: tasks.value
    }
  }

  function touch(): void {
    scheduleSave('data')
  }

  function hydrate(file: DataFile | undefined): void {
    const source = file ?? defaultData()
    projects.value = source.projects ?? []
    sequences.value = source.sequences ?? []
    lines.value = source.lines ?? []
    boards.value = source.boards ?? []
    columns.value = source.columns ?? []
    tasks.value = source.tasks ?? []
  }

  registerSource('data', serialize)

  return {
    projects,
    sequences,
    lines,
    boards,
    columns,
    tasks,
    counts,
    projectsOfTool,
    sequencesOfProject,
    linesOfSequence,
    visibleLines,
    hiddenLines,
    maskedLines,
    project,
    sequence,
    line,
    board,
    column,
    task,
    columnsOfBoard,
    tasksOfBoard,
    tasksOfColumn,
    tasksOfGroup,
    descendantsOfProject,
    descendantsOfBoard,
    insertProject,
    insertSequence,
    insertLine,
    removeProject,
    removeSequence,
    removeLine,
    patchProject,
    patchSequence,
    patchLine,
    insertBoard,
    removeBoard,
    patchBoard,
    insertColumn,
    removeColumn,
    patchColumn,
    insertTask,
    appendTasks,
    removeTask,
    patchTask,
    reorderColumns,
    reorderTasks,
    reorderLines,
    reorderSequences,
    reorderProjects,
    serialize,
    hydrate
  }
})
