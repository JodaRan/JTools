import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDataStore } from '@/stores/data'
import { useUndoStore } from '@/stores/undo'
import { useHistoryStore } from '@/stores/history'
import {
  createLine,
  createProject,
  createSequence,
  deleteLine,
  deleteProject,
  reorderLines,
  updateLine
} from '@/lib/commands'

describe('annulation / rétablissement', () => {
  let data: ReturnType<typeof useDataStore>
  let undo: ReturnType<typeof useUndoStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    data = useDataStore()
    undo = useUndoStore()
  })

  /** Monte un projet complet et renvoie ses identifiants. */
  function seed(): { projectId: string; sequenceId: string } {
    const project = createProject('sequences', 'Serveur Prod')
    undo.run(project)
    const sequence = createSequence(project.entityId, 'Backup BDD')
    undo.run(sequence)
    for (const text of ['a', 'b', 'c']) {
      undo.run(createLine(sequence.entityId, text))
    }
    return { projectId: project.entityId, sequenceId: sequence.entityId }
  }

  it('remet une ligne supprimée à sa place exacte', () => {
    const { sequenceId } = seed()
    const middle = data.linesOfSequence(sequenceId)[1]

    undo.run(deleteLine(middle.id))
    expect(data.linesOfSequence(sequenceId).map((l) => l.content)).toEqual(['a', 'c'])

    undo.undo()
    expect(data.linesOfSequence(sequenceId).map((l) => l.content)).toEqual(['a', 'b', 'c'])

    undo.redo()
    expect(data.linesOfSequence(sequenceId).map((l) => l.content)).toEqual(['a', 'c'])
  })

  it('ramène un projet supprimé avec toute sa descendance', () => {
    const { projectId, sequenceId } = seed()

    undo.run(deleteProject(projectId))
    expect(data.projects).toHaveLength(0)
    expect(data.sequences).toHaveLength(0)
    expect(data.lines).toHaveLength(0)

    undo.undo()
    expect(data.projects).toHaveLength(1)
    expect(data.sequencesOfProject(projectId)).toHaveLength(1)
    expect(data.linesOfSequence(sequenceId).map((l) => l.content)).toEqual(['a', 'b', 'c'])
  })

  it('annule un réordonnancement', () => {
    const { sequenceId } = seed()
    const [a, b, c] = data.linesOfSequence(sequenceId)

    undo.run(reorderLines(sequenceId, [c.id, a.id, b.id]))
    expect(data.linesOfSequence(sequenceId).map((l) => l.content)).toEqual(['c', 'a', 'b'])

    undo.undo()
    expect(data.linesOfSequence(sequenceId).map((l) => l.content)).toEqual(['a', 'b', 'c'])
  })

  it('replie une rafale de frappe en une seule annulation', () => {
    const { sequenceId } = seed()
    const first = data.linesOfSequence(sequenceId)[0]
    const depth = undo.past.length

    for (const text of ['ab', 'abc', 'abcd']) undo.run(updateLine(first.id, text))
    expect(data.line(first.id)?.content).toBe('abcd')
    expect(undo.past.length).toBe(depth + 1)

    undo.undo()
    expect(data.line(first.id)?.content).toBe('a')
  })

  it('ne fusionne plus une fois la fenêtre de frappe passée', () => {
    vi.useFakeTimers()
    try {
      const { sequenceId } = seed()
      const first = data.linesOfSequence(sequenceId)[0]
      const depth = undo.past.length

      undo.run(updateLine(first.id, 'ab'))
      vi.advanceTimersByTime(2000)
      // `Date.now` doit avancer aussi : c'est lui qui borne la fusion.
      vi.setSystemTime(Date.now() + 2000)
      undo.run(updateLine(first.id, 'abc'))

      expect(undo.past.length).toBe(depth + 2)
      undo.undo()
      expect(data.line(first.id)?.content).toBe('ab')
    } finally {
      vi.useRealTimers()
    }
  })

  it('une nouvelle action coupe la branche de rétablissement', () => {
    const { sequenceId } = seed()
    undo.run(deleteLine(data.linesOfSequence(sequenceId)[0].id))
    undo.undo()
    expect(undo.canRedo).toBe(true)

    undo.run(createLine(sequenceId, 'd'))
    expect(undo.canRedo).toBe(false)
  })

  it('alimente le journal persistant', () => {
    const history = useHistoryStore()
    const { sequenceId } = seed()
    undo.run(deleteLine(data.linesOfSequence(sequenceId)[0].id))

    const last = history.recent[0]
    expect(last.action).toBe('delete')
    expect(last.entityType).toBe('line')
    expect(last.sequenceId).toBe(sequenceId)
    expect(last.label).toContain('Supprimer')
  })
})
