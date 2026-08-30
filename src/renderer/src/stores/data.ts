import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { registerSource, scheduleSave } from '@/lib/persist'
import { now } from '@/lib/id'
import {
  SCHEMA_VERSION,
  defaultData,
  type DataFile,
  type Line,
  type Project,
  type Sequence
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

  const counts = computed(() => ({
    projects: projects.value.length,
    sequences: sequences.value.length,
    lines: lines.value.length
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
  function descendantsOfProject(projectId: string): { sequences: Sequence[]; lines: Line[] } {
    const seqs = sequences.value.filter((s) => s.projectId === projectId)
    const ids = new Set(seqs.map((s) => s.id))
    return { sequences: seqs, lines: lines.value.filter((l) => ids.has(l.sequenceId)) }
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
      lines: lines.value
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
  }

  registerSource('data', serialize)

  return {
    projects,
    sequences,
    lines,
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
    descendantsOfProject,
    insertProject,
    insertSequence,
    insertLine,
    removeProject,
    removeSequence,
    removeLine,
    patchProject,
    patchSequence,
    patchLine,
    reorderLines,
    reorderSequences,
    reorderProjects,
    serialize,
    hydrate
  }
})
