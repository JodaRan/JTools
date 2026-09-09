import { useDataStore } from '@/stores/data'
import { useHistoryStore } from '@/stores/history'
import { newId, now } from '@/lib/id'
import type { EntityType, HistoryAction, Line, Project, Sequence } from '@shared/models'

/** Où regarder quand une annulation ramène quelque chose à la vie. */
export interface CommandFocus {
  toolId: string
  projectId?: string
  sequenceId?: string
  lineId?: string
  /** Carte à mettre en évidence dans un tableau de tâches. */
  taskId?: string
}

export interface Command {
  /** Phrase affichée dans l'historique et les toasts. Ex. « Supprimer la ligne "gzip dump.sql" ». */
  label: string
  action: HistoryAction
  entityType: EntityType
  entityId: string
  sequenceId: string | null
  focus?: CommandFocus
  before?: unknown
  after?: unknown
  /**
   * Deux commandes de suite portant la même clé fusionnent en une seule entrée
   * annulable : taper vingt caractères ne doit pas coûter vingt Ctrl+Z.
   */
  coalesceKey?: string
  do(): void
  undo(): void
}

/** Coupe un texte long pour qu'il tienne dans un libellé. */
const short = (text: string, max = 32): string => {
  const clean = text.trim().replace(/\s+/g, ' ')
  if (!clean) return '(vide)'
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

/** Points affichés à la place d'un secret, en nombre fixe : la longueur d'un
 *  mot de passe est déjà une information. */
export const MASK = '••••••••'

/**
 * Libellé sûr pour l'historique. Le journal est lisible dans le panneau
 * latéral et persisté en clair : le contenu d'une ligne masquée n'y entre pas.
 */
function labelOf(lineId: string, fallback = ''): string {
  const data = useDataStore()
  const line = data.line(lineId)
  if (line?.masked) return MASK
  return short(line?.content ?? fallback)
}

/**
 * Reconstitue le chemin complet d'une séquence : après une annulation, le
 * shell doit pouvoir ramener l'utilisateur exactement là où ça s'est passé.
 */
function focusForSequence(sequenceId: string, lineId?: string): CommandFocus | undefined {
  const data = useDataStore()
  const sequence = data.sequence(sequenceId)
  if (!sequence) return undefined
  const project = data.project(sequence.projectId)
  if (!project) return undefined
  return { toolId: project.toolId, projectId: project.id, sequenceId, lineId }
}

// —————————————————————————————— Projets ——————————————————————————————

export function createProject(toolId: string, name: string): Command {
  const data = useDataStore()
  const stamp = now()
  const project: Project = {
    id: newId(),
    toolId,
    name: name.trim() || 'Projet sans nom',
    description: '',
    order: data.projectsOfTool(toolId).length,
    createdAt: stamp,
    updatedAt: stamp
  }
  return {
    label: `Créer le projet « ${short(project.name)} »`,
    action: 'create',
    entityType: 'project',
    entityId: project.id,
    sequenceId: null,
    focus: { toolId, projectId: project.id },
    after: clone(project),
    do: () => data.insertProject(clone(project)),
    undo: () => data.removeProject(project.id)
  }
}

export function renameProject(id: string, name: string): Command {
  const data = useDataStore()
  const previous = data.project(id)?.name ?? ''
  return {
    label: `Renommer le projet en « ${short(name)} »`,
    action: 'update',
    entityType: 'project',
    entityId: id,
    sequenceId: null,
    before: previous,
    after: name,
    do: () => data.patchProject(id, { name }),
    undo: () => data.patchProject(id, { name: previous })
  }
}

export function deleteProject(id: string): Command {
  const data = useDataStore()
  const project = clone(data.project(id)!)
  // Les descendants partent avec le projet, et doivent revenir avec lui.
  const descendants = clone(data.descendantsOfProject(id))
  const index = data.projectsOfTool(project.toolId).findIndex((p) => p.id === id)

  return {
    label: `Supprimer le projet « ${short(project.name)} »`,
    action: 'delete',
    entityType: 'project',
    entityId: id,
    sequenceId: null,
    focus: { toolId: project.toolId, projectId: id },
    before: { project, ...descendants },
    do: () => {
      for (const task of descendants.tasks) data.removeTask(task.id)
      for (const column of descendants.columns) data.removeColumn(column.id)
      for (const board of descendants.boards) data.removeBoard(board.id)
      for (const line of descendants.lines) data.removeLine(line.id)
      for (const sequence of descendants.sequences) data.removeSequence(sequence.id)
      data.removeProject(id)
    },
    undo: () => {
      data.insertProject(clone(project), index)
      for (const sequence of descendants.sequences) data.insertSequence(clone(sequence))
      for (const line of descendants.lines) data.insertLine(clone(line))
      for (const board of descendants.boards) data.insertBoard(clone(board))
      for (const column of descendants.columns) data.insertColumn(clone(column))
      for (const task of descendants.tasks) data.insertTask(clone(task))
    }
  }
}

export function reorderProjects(toolId: string, orderedIds: string[]): Command {
  const data = useDataStore()
  const previous = data.projectsOfTool(toolId).map((p) => p.id)
  return {
    label: 'Réordonner les projets',
    action: 'reorder',
    entityType: 'project',
    entityId: toolId,
    sequenceId: null,
    before: previous,
    after: orderedIds,
    do: () => data.reorderProjects(toolId, orderedIds),
    undo: () => data.reorderProjects(toolId, previous)
  }
}

// ————————————————————————————— Séquences —————————————————————————————

export function createSequence(projectId: string, name: string): Command {
  const data = useDataStore()
  const stamp = now()
  const sequence: Sequence = {
    id: newId(),
    projectId,
    name: name.trim() || 'Séquence sans nom',
    description: '',
    order: data.sequencesOfProject(projectId).length,
    createdAt: stamp,
    updatedAt: stamp
  }
  // La séquence n'existe pas encore : le repère se construit depuis son projet.
  // Sans lui, annuler la création laisserait l'utilisateur devant un « cette
  // séquence n'existe plus » au lieu de le ramener à la liste.
  const project = data.project(projectId)

  return {
    label: `Créer la séquence « ${short(sequence.name)} »`,
    action: 'create',
    entityType: 'sequence',
    entityId: sequence.id,
    sequenceId: sequence.id,
    focus: project ? { toolId: project.toolId, projectId, sequenceId: sequence.id } : undefined,
    after: clone(sequence),
    do: () => data.insertSequence(clone(sequence)),
    undo: () => data.removeSequence(sequence.id)
  }
}

export function renameSequence(id: string, name: string, label = 'séquence'): Command {
  const data = useDataStore()
  const previous = data.sequence(id)?.name ?? ''
  return {
    label: `Renommer le ${label} en « ${short(name)} »`,
    action: 'update',
    entityType: 'sequence',
    entityId: id,
    sequenceId: id,
    before: previous,
    after: name,
    do: () => data.patchSequence(id, { name }),
    undo: () => data.patchSequence(id, { name: previous })
  }
}

/**
 * Supprime une séquence — c'est-à-dire aussi bien une liste de commandes qu'un
 * tableau de tâches : les deux partagent l'entité, et donc l'onglet, le fil
 * d'Ariane et cette suppression. Le libellé suit l'outil pour rester juste.
 */
export function deleteSequence(id: string, label = 'séquence'): Command {
  const data = useDataStore()
  const sequence = clone(data.sequence(id)!)
  const lines = clone(data.linesOfSequence(id))
  const board = data.board(id) ? clone(data.board(id)!) : null
  const { columns, tasks } = clone(data.descendantsOfBoard(id))
  const index = data.sequencesOfProject(sequence.projectId).findIndex((s) => s.id === id)

  return {
    label: `Supprimer le ${label} « ${short(sequence.name)} »`,
    action: 'delete',
    entityType: 'sequence',
    entityId: id,
    sequenceId: id,
    focus: focusForSequence(id),
    before: { sequence, lines, board, columns, tasks },
    do: () => {
      for (const line of lines) data.removeLine(line.id)
      for (const task of tasks) data.removeTask(task.id)
      for (const column of columns) data.removeColumn(column.id)
      if (board) data.removeBoard(board.id)
      data.removeSequence(id)
    },
    undo: () => {
      data.insertSequence(clone(sequence), index)
      for (const line of lines) data.insertLine(clone(line))
      if (board) data.insertBoard(clone(board))
      for (const column of columns) data.insertColumn(clone(column))
      for (const task of tasks) data.insertTask(clone(task))
    }
  }
}

export function reorderSequences(projectId: string, orderedIds: string[]): Command {
  const data = useDataStore()
  const previous = data.sequencesOfProject(projectId).map((s) => s.id)
  return {
    label: 'Réordonner les séquences',
    action: 'reorder',
    entityType: 'sequence',
    entityId: projectId,
    sequenceId: null,
    before: previous,
    after: orderedIds,
    do: () => data.reorderSequences(projectId, orderedIds),
    undo: () => data.reorderSequences(projectId, previous)
  }
}

// —————————————————————————————— Lignes ———————————————————————————————

export function createLine(sequenceId: string, content: string, at?: number): Command {
  const data = useDataStore()
  const stamp = now()
  const line: Line = {
    id: newId(),
    sequenceId,
    content,
    comment: '',
    hidden: false,
    masked: false,
    order: at ?? data.linesOfSequence(sequenceId).length,
    createdAt: stamp,
    updatedAt: stamp
  }
  return {
    label: content.trim() ? `Ajouter « ${short(content)} »` : 'Ajouter une ligne',
    action: 'create',
    entityType: 'line',
    entityId: line.id,
    sequenceId,
    focus: focusForSequence(sequenceId, line.id),
    after: clone(line),
    do: () => data.insertLine(clone(line), at),
    undo: () => data.removeLine(line.id)
  }
}

/** Commande qui crée plusieurs lignes d'un coup, en exposant leurs identifiants. */
export interface MultiLineCommand extends Command {
  entityIds: string[]
}

/**
 * Insère un bloc de lignes en une seule opération.
 *
 * Le point important est l'annulation : coller cinquante lignes puis faire
 * Ctrl+Z doit les retirer toutes, pas revenir en arrière cinquante fois.
 */
export function createLines(
  sequenceId: string,
  contents: string[],
  at?: number
): MultiLineCommand {
  const data = useDataStore()
  const stamp = now()
  const start = at ?? data.linesOfSequence(sequenceId).length

  const lines: Line[] = contents.map((content, index) => ({
    id: newId(),
    sequenceId,
    content,
    comment: '',
    hidden: false,
    masked: false,
    order: start + index,
    createdAt: stamp,
    updatedAt: stamp
  }))

  return {
    label: `Coller ${lines.length} ligne${lines.length > 1 ? 's' : ''}`,
    action: 'create',
    entityType: 'line',
    entityId: lines[0].id,
    entityIds: lines.map((line) => line.id),
    sequenceId,
    focus: focusForSequence(sequenceId, lines[0].id),
    after: clone(lines),
    do: () => lines.forEach((line, index) => data.insertLine(clone(line), start + index)),
    // À rebours : retirer par la fin évite de renuméroter à chaque retrait.
    undo: () => [...lines].reverse().forEach((line) => data.removeLine(line.id))
  }
}

/**
 * Colle un bloc au milieu d'une ligne existante, comme le ferait un éditeur de
 * texte : ce qui précède le curseur reste sur place et reçoit le début du
 * collage, ce qui suit part à la fin de la dernière ligne insérée.
 */
export function pasteIntoLine(
  id: string,
  before: string,
  after: string,
  parts: string[]
): MultiLineCommand {
  const data = useDataStore()
  const line = data.line(id)!
  const previous = line.content
  const sequenceId = line.sequenceId
  const index = data.linesOfSequence(sequenceId).findIndex((item) => item.id === id)

  const head = before + parts[0]
  const tail = parts.slice(1)
  // Le reste de la ligne d'origine se raccroche au dernier morceau collé.
  if (tail.length > 0) tail[tail.length - 1] += after
  else return { ...updateLine(id, head + after), entityIds: [id] }

  const inserted = createLines(sequenceId, tail, index + 1)

  return {
    label: `Coller ${parts.length} lignes`,
    action: 'create',
    entityType: 'line',
    entityId: id,
    entityIds: [id, ...inserted.entityIds],
    sequenceId,
    focus: focusForSequence(sequenceId, id),
    before: previous,
    after: clone(parts),
    do: () => {
      data.patchLine(id, { content: head })
      inserted.do()
    },
    undo: () => {
      inserted.undo()
      data.patchLine(id, { content: previous })
    }
  }
}

export function updateLine(id: string, content: string): Command {
  const data = useDataStore()
  const previous = data.line(id)?.content ?? ''
  return {
    label: `Modifier « ${data.line(id)?.masked ? MASK : short(content)} »`,
    action: 'update',
    entityType: 'line',
    entityId: id,
    sequenceId: data.line(id)?.sequenceId ?? null,
    focus: focusForSequence(data.line(id)?.sequenceId ?? '', id),
    before: previous,
    after: content,
    // La frappe continue se replie sur une seule entrée d'annulation.
    coalesceKey: `line-content:${id}`,
    do: () => data.patchLine(id, { content }),
    undo: () => data.patchLine(id, { content: previous })
  }
}

export function deleteLine(id: string): Command {
  const data = useDataStore()
  const line = clone(data.line(id)!)
  const index = data.linesOfSequence(line.sequenceId).findIndex((l) => l.id === id)
  return {
    label: `Supprimer « ${line.masked ? MASK : short(line.content)} »`,
    action: 'delete',
    entityType: 'line',
    entityId: id,
    sequenceId: line.sequenceId,
    focus: focusForSequence(line.sequenceId, id),
    before: line,
    do: () => data.removeLine(id),
    undo: () => data.insertLine(clone(line), index)
  }
}

export function setLineHidden(id: string, hidden: boolean): Command {
  const data = useDataStore()
  const line = data.line(id)
  return {
    label: hidden ? `Cacher « ${labelOf(id)} »` : `Réafficher « ${labelOf(id)} »`,
    action: hidden ? 'hide' : 'unhide',
    entityType: 'line',
    entityId: id,
    sequenceId: line?.sequenceId ?? null,
    focus: focusForSequence(line?.sequenceId ?? '', id),
    before: !hidden,
    after: hidden,
    do: () => data.patchLine(id, { hidden }),
    undo: () => data.patchLine(id, { hidden: !hidden })
  }
}

/**
 * Bascule le masquage. Le libellé est calculé avant l'exécution : démasquer
 * une ligne ne doit pas faire apparaître son contenu dans le journal.
 */
export function setLineMasked(id: string, masked: boolean): Command {
  const data = useDataStore()
  const line = data.line(id)
  return {
    label: masked ? `Masquer « ${MASK} »` : `Démasquer une ligne`,
    action: masked ? 'mask' : 'unmask',
    entityType: 'line',
    entityId: id,
    sequenceId: line?.sequenceId ?? null,
    focus: focusForSequence(line?.sequenceId ?? '', id),
    before: !masked,
    after: masked,
    do: () => {
      data.patchLine(id, { masked })
      // La ligne a pu vivre en clair un moment : on efface ce qu'on en a écrit.
      if (masked) useHistoryStore().redactLine(id)
    },
    undo: () => data.patchLine(id, { masked: !masked })
  }
}

export function setLineComment(id: string, comment: string): Command {
  const data = useDataStore()
  const line = data.line(id)
  const previous = line?.comment ?? ''
  return {
    label: comment.trim() ? `Commenter « ${labelOf(id)} »` : 'Retirer le commentaire',
    action: 'comment',
    entityType: 'line',
    entityId: id,
    sequenceId: line?.sequenceId ?? null,
    focus: focusForSequence(line?.sequenceId ?? '', id),
    before: previous,
    after: comment,
    do: () => data.patchLine(id, { comment }),
    undo: () => data.patchLine(id, { comment: previous })
  }
}

export function reorderLines(sequenceId: string, orderedIds: string[]): Command {
  const data = useDataStore()
  const previous = data.linesOfSequence(sequenceId).map((l) => l.id)
  return {
    label: 'Réordonner les lignes',
    action: 'reorder',
    entityType: 'line',
    entityId: sequenceId,
    sequenceId,
    focus: focusForSequence(sequenceId),
    before: previous,
    after: orderedIds,
    do: () => data.reorderLines(sequenceId, orderedIds),
    undo: () => data.reorderLines(sequenceId, previous)
  }
}

export { short as shortLabel }
