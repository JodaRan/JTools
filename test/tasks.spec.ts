import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDataStore } from '@/stores/data'
import { useUndoStore } from '@/stores/undo'
import { buildBoard, parseLegacyBoard, planImport, type LegacySource } from '@/lib/legacy'
import {
  createBoard,
  createColumn,
  createTask,
  deleteColumn,
  importLegacyBoards,
  moveTask,
  reorderTasks,
  setTaskPriority
} from '@/lib/task-commands'
import { PRIORITIES, UNASSIGNED, type Priority } from '@shared/models'

const SAVES = resolve(process.cwd(), 'saves')

/** Les sauvegardes de l'ancien outil, telles qu'elles sont livrées. */
const sources = (): LegacySource[] => {
  if (!existsSync(SAVES)) return []
  return readdirSync(SAVES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      file: resolve(SAVES, entry.name, 'data.json')
    }))
    .filter((entry) => existsSync(entry.file))
    .map((entry) => ({
      name: entry.name,
      legacy: parseLegacyBoard(JSON.parse(readFileSync(entry.file, 'utf-8')))!
    }))
}

describe('reprise des sauvegardes de l’ancien outil', () => {
  const all = sources()

  it('lit les six dossiers livrés', () => {
    expect(all.length).toBeGreaterThan(0)
    for (const source of all) expect(source.legacy).not.toBeNull()
  })

  it('reprend chaque statut en colonne, dans l’ordre déclaré', () => {
    for (const { name, legacy } of all) {
      const built = buildBoard('board-1', legacy)
      expect(built.columns.map((column) => column.name), name).toEqual(
        expect.arrayContaining(legacy.statuses)
      )
      // Aucune tâche ne se retrouve sans colonne.
      const ids = new Set(built.columns.map((column) => column.id))
      for (const task of built.tasks) expect(ids.has(task.columnId), name).toBe(true)
    }
  })

  it('ne perd aucune tâche', () => {
    for (const { name, legacy } of all) {
      const built = buildBoard('board-1', legacy)
      expect(built.tasks.length, name).toBe(legacy.tasks.length)
    }
  })

  /**
   * Le cœur de la reprise : dans l'ancien format, `order` se compte au sein
   * d'une priorité. Les fichiers ont des trous et des doublons — après
   * reprise, chaque groupe doit porter des rangs denses et uniques.
   */
  it('redonne des rangs denses et uniques par colonne et par priorité', () => {
    for (const { name, legacy } of all) {
      const built = buildBoard('board-1', legacy)
      const groups = new Map<string, number[]>()
      for (const task of built.tasks) {
        const key = `${task.columnId} ${task.priority}`
        groups.set(key, [...(groups.get(key) ?? []), task.order])
      }
      for (const [key, ranks] of groups) {
        const sorted = [...ranks].sort((a, b) => a - b)
        expect(sorted, `${name} ${key}`).toEqual(ranks.map((_, index) => index))
      }
    }
  })

  it('garde l’ordre relatif d’origine dans un groupe', () => {
    const legacy = parseLegacyBoard({
      statuses: ['À faire'],
      members: [],
      tasks: [
        { id: 3, title: 'c', status: 'À faire', priority: 'Haute', order: 30 },
        { id: 1, title: 'a', status: 'À faire', priority: 'Haute', order: 5 },
        { id: 2, title: 'b', status: 'À faire', priority: 'Haute', order: 11 }
      ]
    })!
    const built = buildBoard('board-1', legacy)
    const ordered = [...built.tasks].sort((a, b) => a.order - b.order)
    expect(ordered.map((task) => task.title)).toEqual(['a', 'b', 'c'])
  })

  it('départage les rangs égaux par ancienneté', () => {
    const legacy = parseLegacyBoard({
      statuses: ['À faire'],
      members: [],
      tasks: [
        { id: 1_772_000_000_000, title: 'récente', status: 'À faire', priority: 'Basse', order: 3 },
        { id: 1_765_000_000_000, title: 'ancienne', status: 'À faire', priority: 'Basse', order: 3 }
      ]
    })!
    const built = buildBoard('board-1', legacy)
    const ordered = [...built.tasks].sort((a, b) => a.order - b.order)
    expect(ordered.map((task) => task.title)).toEqual(['ancienne', 'récente'])
  })

  it('traduit les priorités et complète la liste des acteurs', () => {
    const legacy = parseLegacyBoard({
      statuses: ['A'],
      members: ['Non assigné', 'Léo'],
      tasks: [
        { id: 1, title: 'x', status: 'A', priority: 'Urgente', assignee: 'Toky' },
        { id: 2, title: 'y', status: 'A', priority: 'inconnue' }
      ]
    })!
    const built = buildBoard('board-1', legacy)
    expect(built.tasks[0].priority).toBe('urgent')
    expect(built.tasks[0].assignee).toBe('Toky')
    // Priorité inconnue : « Moyenne », comme dans l'ancien outil.
    expect(built.tasks[1].priority).toBe('medium')
    expect(built.tasks[1].assignee).toBe(UNASSIGNED)
    expect(built.board.assignees[0]).toBe(UNASSIGNED)
    expect(built.board.assignees).toContain('Toky')
    expect(built.board.assignees).toContain('Léo')
  })

  it('crée une colonne pour un statut qui n’était pas déclaré', () => {
    const legacy = parseLegacyBoard({
      statuses: ['À faire'],
      members: [],
      tasks: [{ id: 1, title: 'x', status: 'Bloqué', priority: 'Basse' }]
    })!
    const built = buildBoard('board-1', legacy)
    expect(built.columns.map((column) => column.name)).toEqual(['À faire', 'Bloqué'])
    const bloque = built.columns.find((column) => column.name === 'Bloqué')!
    expect(built.tasks[0].columnId).toBe(bloque.id)
  })

  it('date la tâche depuis son identifiant quand la date manque', () => {
    const legacy = parseLegacyBoard({
      statuses: ['A'],
      members: [],
      tasks: [{ id: 1_767_116_110_038, title: 'x', status: 'A' }]
    })!
    const built = buildBoard('board-1', legacy)
    expect(built.tasks[0].date).toBe(new Date(1_767_116_110_038).toISOString().slice(0, 10))
    // L'ancien outil ne datait pas les changements de statut : rien n'est inventé.
    expect(built.tasks[0].statusChangedAt).toBe('')
    expect(built.tasks[0].estimate).toBe('')
  })

  it('regroupe les sprints d’un même projet', () => {
    const plans = planImport(
      ['Ephrata', 'Ephrata_sprint_2', 'Ephrata_sprint_3', 'Varotra'].map((name) => ({
        name,
        legacy: { tasks: [], statuses: [], members: [] }
      }))
    )
    const ephrata = plans.find((plan) => plan.projectName === 'Ephrata')!
    expect(ephrata.boards.map((board) => board.name)).toEqual([
      'Sprint 1',
      'Sprint 2',
      'Sprint 3'
    ])
    const varotra = plans.find((plan) => plan.projectName === 'Varotra')!
    expect(varotra.boards.map((board) => board.name)).toEqual(['Tableau'])
  })
})

describe('tableau — ordre et déplacements', () => {
  let data: ReturnType<typeof useDataStore>
  let undo: ReturnType<typeof useUndoStore>
  let boardId: string

  beforeEach(() => {
    setActivePinia(createPinia())
    data = useDataStore()
    undo = useUndoStore()
    const command = createBoard('project-1', 'Tableau')
    undo.run(command)
    boardId = command.entityId
  })

  const columnId = (index: number): string => data.columnsOfBoard(boardId)[index].id

  const add = (column: number, title: string, priority: Priority): string => {
    const command = createTask(boardId, columnId(column), title, { priority })
    undo.run(command)
    return command.entityId
  }

  const titles = (column: number): string[] =>
    data.tasksOfColumn(columnId(column)).map((task) => task.title)

  it('crée un tableau avec ses quatre colonnes', () => {
    expect(data.columnsOfBoard(boardId).map((column) => column.name)).toEqual([
      'À faire',
      'En cours',
      'En révision',
      'Terminé'
    ])
    expect(data.board(boardId)?.assignees).toEqual([UNASSIGNED])
  })

  it('range les cartes par priorité, puis par rang', () => {
    add(0, 'moyenne 1', 'medium')
    add(0, 'urgente', 'urgent')
    add(0, 'basse', 'low')
    add(0, 'moyenne 2', 'medium')
    add(0, 'haute', 'high')
    expect(titles(0)).toEqual(['urgente', 'haute', 'moyenne 1', 'moyenne 2', 'basse'])
  })

  it('ne réordonne qu’au sein d’une même priorité', () => {
    const a = add(0, 'a', 'medium')
    const b = add(0, 'b', 'medium')
    add(0, 'urgente', 'urgent')

    undo.run(reorderTasks(columnId(0), 'medium', [b, a]))
    expect(titles(0)).toEqual(['urgente', 'b', 'a'])

    // Le groupe voisin n'a pas bougé : ses rangs sont intacts.
    expect(data.tasksOfGroup(columnId(0), 'urgent').map((task) => task.order)).toEqual([0])
  })

  it('déplace une carte d’une colonne à l’autre sans toucher à sa priorité', () => {
    const moved = add(0, 'a', 'high')
    add(1, 'déjà là', 'high')

    undo.run(moveTask(moved, columnId(1), [moved, data.tasksOfGroup(columnId(1), 'high')[0].id]))

    expect(data.task(moved)?.columnId).toBe(columnId(1))
    expect(data.task(moved)?.priority).toBe('high')
    expect(titles(1)).toEqual(['a', 'déjà là'])
    // Le déplacement date le changement de statut — et lui seul.
    expect(data.task(moved)?.statusChangedAt).not.toBe('')
  })

  it('annule un déplacement, colonne, rang et date compris', () => {
    const first = add(0, 'a', 'medium')
    const second = add(0, 'b', 'medium')
    add(1, 'ailleurs', 'medium')

    undo.run(moveTask(second, columnId(1), [second]))
    undo.undo()

    expect(data.task(second)?.columnId).toBe(columnId(0))
    expect(data.task(second)?.statusChangedAt).toBe('')
    expect(data.tasksOfGroup(columnId(0), 'medium').map((task) => task.id)).toEqual([
      first,
      second
    ])
  })

  it('change de priorité par la fin du nouveau groupe, et sait revenir', () => {
    const a = add(0, 'a', 'medium')
    const b = add(0, 'b', 'medium')
    const c = add(0, 'c', 'high')

    undo.run(setTaskPriority(a, 'high'))
    expect(titles(0)).toEqual(['c', 'a', 'b'])
    expect(data.tasksOfGroup(columnId(0), 'high').map((task) => task.id)).toEqual([c, a])

    undo.undo()
    expect(titles(0)).toEqual(['c', 'a', 'b'])
    expect(data.tasksOfGroup(columnId(0), 'medium').map((task) => task.id)).toEqual([a, b])
  })

  it('supprime une colonne avec ses tâches, et les ramène ensemble', () => {
    add(0, 'a', 'medium')
    add(0, 'b', 'urgent')
    const target = data.columnsOfBoard(boardId)[0]

    undo.run(deleteColumn(target.id))
    expect(data.columnsOfBoard(boardId).length).toBe(3)
    expect(data.tasksOfBoard(boardId).length).toBe(0)

    undo.undo()
    expect(data.columnsOfBoard(boardId).map((column) => column.name)[0]).toBe(target.name)
    expect(titles(0)).toEqual(['b', 'a'])
  })

  it('ajoute une colonne à la fin sans trouer la numérotation', () => {
    undo.run(createColumn(boardId, 'Bloqué'))
    expect(data.columnsOfBoard(boardId).map((column) => column.order)).toEqual([0, 1, 2, 3, 4])
    expect(data.columnsOfBoard(boardId).at(-1)?.name).toBe('Bloqué')
  })

  it('numérote les priorités dans l’ordre attendu', () => {
    expect([...PRIORITIES]).toEqual(['urgent', 'high', 'medium', 'low'])
  })
})

describe('import dans l’application', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('reprend un dossier entier, et le retire d’un seul coup', () => {
    const data = useDataStore()
    const undo = useUndoStore()
    const all = sources()
    if (all.length === 0) return

    const plans = planImport(all)
    const command = importLegacyBoards('tasks', plans)
    undo.run(command)

    const total = all.reduce((sum, source) => sum + source.legacy.tasks.length, 0)
    expect(data.tasks.length).toBe(total)
    expect(data.projectsOfTool('tasks').length).toBe(plans.length)
    expect(command.outcome.boards).toBe(plans.reduce((sum, plan) => sum + plan.boards.length, 0))

    // Chaque tableau reste rattaché à une séquence, donc à un onglet possible.
    for (const board of data.boards) expect(data.sequence(board.id)).toBeDefined()

    undo.undo()
    expect(data.tasks.length).toBe(0)
    expect(data.columns.length).toBe(0)
    expect(data.boards.length).toBe(0)
    expect(data.sequences.length).toBe(0)
    expect(data.projectsOfTool('tasks').length).toBe(0)
  })

  it('verse les tableaux dans un projet existant quand on lui en donne un', () => {
    const data = useDataStore()
    const undo = useUndoStore()
    const plans = planImport([
      { name: 'Efaina', legacy: { tasks: [], statuses: ['A'], members: [] } }
    ])
    undo.run(importLegacyBoards('tasks', plans, 'project-existant'))

    expect(data.projectsOfTool('tasks').length).toBe(0)
    expect(data.sequences[0].projectId).toBe('project-existant')
  })
})
