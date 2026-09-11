/**
 * Commandes et règles de l'outil « Exercices ».
 *
 * Un TYPE d'exercice est un projet, une PARTIE est une séquence : les deux
 * héritent ainsi de l'onglet, du fil d'Ariane, de la vue côte à côte et de la
 * suppression, sans une ligne de code en plus.
 *
 * L'annulation, ici, ne couvre que ce qui touche au contenu : importer,
 * vider, supprimer une question, changer le guide d'un type. Répondre à une
 * question n'y entre pas — un Ctrl+Z qui déferait un exercice serait une
 * fausse route — et passe directement par le store.
 */
import { useDataStore } from '@/stores/data'
import { newId, now } from '@/lib/id'
import { fold } from '@/lib/fuzzy'
import { parseCsv, toCsv } from '@/lib/csv'
import { shortLabel as short, type Command, type CommandFocus } from '@/lib/commands'
import { BLANK_TYPE_SPEC, CHOICE_SEPARATOR, CSV_HEADERS, SEED_TYPES } from '@/lib/drill-prompts'
import type {
  DrillAnswer,
  DrillRun,
  DrillSet,
  DrillType,
  Project,
  Question,
  QuestionKind,
  Sequence
} from '@shared/models'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

/** Repère de l'annulation : une partie, et la question concernée. */
function focusForSet(setId: string): CommandFocus | undefined {
  const data = useDataStore()
  const sequence = data.sequence(setId)
  if (!sequence) return undefined
  const project = data.project(sequence.projectId)
  if (!project) return undefined
  return { toolId: project.toolId, projectId: project.id, sequenceId: setId }
}

// ————————————————————————— Correction des réponses —————————————————————————

/** Texte comparable : sans accents, sans casse, sans ponctuation de bord. */
const normalize = (value: string): string =>
  fold(value)
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:!?"'«»()[\]]+|[\s.,;:!?"'«»()[\]]+$/g, '')
    .trim()

/**
 * Lit un nombre écrit à la française comme à l'anglaise : virgule ou point
 * décimal, espaces de milliers (y compris insécables), signe, pourcentage.
 * Rend `null` si ce n'en est pas un — la comparaison retombe alors sur le
 * texte.
 */
export function toNumber(value: string): number | null {
  const cleaned = value
    .replace(/[\s  ']/g, '')
    .replace(/%$/, '')
    .replace(',', '.')
  if (cleaned === '' || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(cleaned)) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * La réponse donnée vaut-elle la réponse attendue ?
 *
 * Deux nombres se comparent comme des nombres — `0,5`, `.5` et `0.50` sont la
 * même réponse. Tout le reste se compare comme du texte replié : l'accent
 * oublié et la majuscule ne coûtent pas un point.
 */
export function isCorrect(question: Question, value: string): boolean {
  const given = value.trim()
  if (given === '') return false

  const expectedNumber = toNumber(question.answer)
  const givenNumber = toNumber(given)
  if (expectedNumber !== null && givenNumber !== null) {
    const scale = Math.max(1, Math.abs(expectedNumber))
    return Math.abs(expectedNumber - givenNumber) <= 1e-9 * scale
  }
  return normalize(given) === normalize(question.answer)
}

// ————————————————————————— Types et parties —————————————————————————

/** Crée une partie : la séquence qui lui sert d'onglet et son enregistrement. */
export function createDrillSet(projectId: string, name: string): Command {
  const data = useDataStore()
  const stamp = now()
  const sequence: Sequence = {
    id: newId(),
    projectId,
    name: name.trim() || 'Partie sans nom',
    description: '',
    order: data.sequencesOfProject(projectId).length,
    createdAt: stamp,
    updatedAt: stamp
  }
  const set: DrillSet = { id: sequence.id, answers: [] }
  const project = data.project(projectId)

  return {
    label: `Créer la partie « ${short(sequence.name)} »`,
    action: 'create',
    entityType: 'sequence',
    entityId: sequence.id,
    sequenceId: sequence.id,
    focus: project ? { toolId: project.toolId, projectId, sequenceId: sequence.id } : undefined,
    after: clone({ sequence, set }),
    do: () => {
      data.insertSequence(clone(sequence))
      data.insertDrillSet(clone(set))
    },
    undo: () => {
      data.removeDrillSet(set.id)
      data.removeSequence(sequence.id)
    }
  }
}

/**
 * Crée un type d'exercice : le projet, son guide, et une première partie —
 * sans quoi le type s'ouvrirait sur une liste vide dont on ne saurait que
 * faire.
 */
export function createDrillType(toolId: string, name: string): Command {
  const data = useDataStore()
  const stamp = now()
  const project: Project = {
    id: newId(),
    toolId,
    name: name.trim() || 'Type sans nom',
    description: '',
    order: data.projectsOfTool(toolId).length,
    createdAt: stamp,
    updatedAt: stamp
  }
  const type: DrillType = { id: project.id, spec: BLANK_TYPE_SPEC }
  const sequence: Sequence = {
    id: newId(),
    projectId: project.id,
    name: 'Série 1',
    description: '',
    order: 0,
    createdAt: stamp,
    updatedAt: stamp
  }
  const set: DrillSet = { id: sequence.id, answers: [] }

  return {
    label: `Créer le type « ${short(project.name)} »`,
    action: 'create',
    entityType: 'project',
    entityId: project.id,
    sequenceId: null,
    focus: { toolId, projectId: project.id },
    after: clone({ project, type, sequence }),
    do: () => {
      data.insertProject(clone(project))
      data.insertDrillType(clone(type))
      data.insertSequence(clone(sequence))
      data.insertDrillSet(clone(set))
    },
    undo: () => {
      data.removeDrillSet(set.id)
      data.removeSequence(sequence.id)
      data.removeDrillType(type.id)
      data.removeProject(project.id)
    }
  }
}

/**
 * Répare un type ou une partie ouverts sans enregistrement propre — projet
 * créé par un autre outil, sauvegarde recollée à la main. Sans cela, le guide
 * de prompt n'aurait nulle part où vivre et le score nulle part où compter.
 */
export function ensureDrillRecords(projectId: string, setId?: string): Command {
  const data = useDataStore()
  const type: DrillType | null = data.drillType(projectId)
    ? null
    : { id: projectId, spec: BLANK_TYPE_SPEC }
  const set: DrillSet | null =
    setId && !data.drillSet(setId) ? { id: setId, answers: [] } : null

  return {
    label: 'Préparer les exercices',
    action: 'create',
    entityType: 'drillType',
    entityId: projectId,
    sequenceId: setId ?? null,
    do: () => {
      if (type) data.insertDrillType(clone(type))
      if (set) data.insertDrillSet(clone(set))
    },
    undo: () => {
      if (set) data.removeDrillSet(set.id)
      if (type) data.removeDrillType(type.id)
    }
  }
}

/** Les cinq types de départ, leurs guides et leurs parties, en une action. */
export function seedDrillTypes(toolId: string): Command {
  const data = useDataStore()
  const stamp = now()
  const existing = new Set(data.projectsOfTool(toolId).map((p) => normalize(p.name)))

  const projects: Project[] = []
  const types: DrillType[] = []
  const sequences: Sequence[] = []
  const sets: DrillSet[] = []

  SEED_TYPES.filter((seed) => !existing.has(normalize(seed.name))).forEach((seed, index) => {
    const project: Project = {
      id: newId(),
      toolId,
      name: seed.name,
      description: seed.description,
      order: data.projectsOfTool(toolId).length + index,
      createdAt: stamp,
      updatedAt: stamp
    }
    projects.push(project)
    types.push({ id: project.id, spec: seed.spec })

    seed.parts.forEach((part, rank) => {
      const sequence: Sequence = {
        id: newId(),
        projectId: project.id,
        name: part.name,
        description: part.description,
        order: rank,
        createdAt: stamp,
        updatedAt: stamp
      }
      sequences.push(sequence)
      sets.push({ id: sequence.id, answers: [] })
    })
  })

  return {
    label: `Créer ${projects.length} type(s) d'exercices`,
    action: 'import',
    entityType: 'project',
    entityId: toolId,
    sequenceId: null,
    focus: { toolId, projectId: projects[0]?.id },
    after: clone({ projects, sequences }),
    do: () => {
      for (const project of projects) data.insertProject(clone(project))
      for (const type of types) data.insertDrillType(clone(type))
      for (const sequence of sequences) data.insertSequence(clone(sequence))
      for (const set of sets) data.insertDrillSet(clone(set))
    },
    undo: () => {
      for (const set of sets) data.removeDrillSet(set.id)
      for (const sequence of sequences) data.removeSequence(sequence.id)
      for (const type of types) data.removeDrillType(type.id)
      for (const project of projects) data.removeProject(project.id)
    }
  }
}

/** Modifie la spécification d'un type. La frappe se replie sur une seule entrée. */
export function setTypeSpec(projectId: string, spec: string): Command {
  const data = useDataStore()
  const previous = data.drillType(projectId)?.spec ?? ''
  const name = data.project(projectId)?.name ?? 'ce type'
  return {
    label: `Modifier le guide de « ${short(name)} »`,
    action: 'update',
    entityType: 'drillType',
    entityId: projectId,
    sequenceId: null,
    before: previous,
    after: spec,
    coalesceKey: `drill-spec:${projectId}`,
    do: () => data.patchDrillType(projectId, { spec }),
    undo: () => data.patchDrillType(projectId, { spec: previous })
  }
}

// ————————————————————————————— Questions —————————————————————————————

/** Colonne du CSV → nom de champ, tolérant sur l'orthographe des en-têtes. */
const HEADER_ALIASES: Record<(typeof CSV_HEADERS)[number], string[]> = {
  question: ['question', 'enonce', 'énoncé', 'prompt', 'intitule', 'intitulé'],
  type: ['type', 'format', 'kind', 'type_de_reponse'],
  choix: ['choix', 'options', 'propositions', 'choices'],
  reponse: ['reponse', 'réponse', 'reponse_correcte', 'bonne_reponse', 'answer', 'solution'],
  explication: ['explication', 'explications', 'explanation', 'correction'],
  lecon: ['lecon', 'leçon', 'cours', 'lesson', 'rappel'],
  lien_lecon: ['lien_lecon', 'lien', 'lien_de_lecon', 'url', 'lesson_url', 'source'],
  description: ['description', 'consigne', 'contexte', 'note']
}

const headerKey = (value: string): string => fold(value).trim().replace(/[\s-]+/g, '_')

/** Associe chaque colonne du fichier à un champ, ou `null` si elle est inconnue. */
function mapHeaders(row: string[]): (string | null)[] | null {
  const mapped = row.map((cell) => {
    const key = headerKey(cell)
    const found = (Object.keys(HEADER_ALIASES) as (typeof CSV_HEADERS)[number][]).find((field) =>
      HEADER_ALIASES[field].some((alias) => headerKey(alias) === key)
    )
    return found ?? null
  })
  // Sans colonne « question », ce n'est pas un en-tête : le fichier commence
  // droit sur les données, et les colonnes sont alors prises dans l'ordre.
  return mapped.includes('question') ? mapped : null
}

export interface ParsedImport {
  questions: Omit<Question, 'id' | 'setId' | 'order' | 'createdAt' | 'updatedAt'>[]
  /** Lignes écartées, avec leur rang dans le fichier et la raison. */
  skipped: { row: number; reason: string }[]
}

/**
 * Résout la réponse d'une question à choix : le texte de l'option, un numéro
 * (1…n) ou une lettre (A…). On range toujours le texte exact de l'option —
 * c'est lui que la correction comparera.
 */
function resolveChoiceAnswer(raw: string, choices: string[]): string {
  const value = raw.trim()
  const exact = choices.find((choice) => normalize(choice) === normalize(value))
  if (exact) return exact

  const index = toNumber(value)
  if (index !== null && Number.isInteger(index) && index >= 1 && index <= choices.length) {
    return choices[index - 1]
  }
  if (/^[a-z]$/i.test(value)) {
    const rank = value.toLowerCase().charCodeAt(0) - 97
    if (rank >= 0 && rank < choices.length) return choices[rank]
  }
  return value
}

/** Lit un CSV d'exercices. Ce qui ne tient pas debout est écarté, pas deviné. */
export function parseQuestionCsv(text: string): ParsedImport {
  const rows = parseCsv(text)
  const out: ParsedImport = { questions: [], skipped: [] }
  if (rows.length === 0) return out

  const header = mapHeaders(rows[0])
  const columns = header ?? [...CSV_HEADERS]
  const body = header ? rows.slice(1) : rows

  body.forEach((row, index) => {
    const line = index + (header ? 2 : 1)
    const get = (field: string): string => {
      const at = columns.indexOf(field)
      return at === -1 ? '' : (row[at] ?? '').trim()
    }

    const prompt = get('question')
    if (!prompt) {
      out.skipped.push({ row: line, reason: 'énoncé vide' })
      return
    }

    const choices = get('choix')
      .split(CHOICE_SEPARATOR)
      .map((choice) => choice.trim())
      .filter(Boolean)

    const declared = headerKey(get('type'))
    const wantsChoice =
      choices.length > 0 &&
      declared !== 'nombre' &&
      declared !== 'number' &&
      declared !== 'numerique'
    const kind: QuestionKind = wantsChoice ? 'choice' : 'number'

    const rawAnswer = get('reponse')
    if (!rawAnswer) {
      out.skipped.push({ row: line, reason: 'réponse correcte absente' })
      return
    }
    const answer = kind === 'choice' ? resolveChoiceAnswer(rawAnswer, choices) : rawAnswer

    if (kind === 'choice' && !choices.some((choice) => normalize(choice) === normalize(answer))) {
      out.skipped.push({ row: line, reason: 'la réponse ne figure pas dans les choix' })
      return
    }
    if (kind === 'number' && toNumber(answer) === null) {
      out.skipped.push({ row: line, reason: 'réponse attendue non numérique et sans choix' })
      return
    }

    out.questions.push({
      kind,
      prompt,
      description: get('description'),
      choices: kind === 'choice' ? choices : [],
      answer,
      explanation: get('explication'),
      lesson: get('lecon'),
      lessonUrl: get('lien_lecon')
    })
  })

  return out
}

/** L'inverse exact de l'import : ce qu'on exporte se réimporte à l'identique. */
export function questionsToCsv(questions: Question[]): string {
  const rows: string[][] = [[...CSV_HEADERS]]
  for (const question of questions) {
    rows.push([
      question.prompt,
      question.kind === 'choice' ? 'choix' : 'nombre',
      question.choices.join(` ${CHOICE_SEPARATOR} `),
      question.answer,
      question.explanation,
      question.lesson,
      question.lessonUrl,
      question.description
    ])
  }
  return toCsv(rows)
}

export interface ImportCommand extends Command {
  /** Nombre de questions réellement ajoutées. */
  added: number
}

/**
 * Importe un lot de questions dans une partie.
 *
 * C'est le seul geste de cet outil qui mérite la pile d'annulation : un
 * fichier de quarante questions entre en une action, et un Ctrl+Z le retire
 * en entier. En mode « replace », les questions déjà là partent avec leurs
 * réponses — et reviennent avec, si l'on annule.
 */
export function importQuestions(
  setId: string,
  parsed: ParsedImport['questions'],
  mode: 'append' | 'replace' = 'append'
): ImportCommand {
  const data = useDataStore()
  const stamp = now()
  const previous = mode === 'replace' ? clone(data.questionsOfSet(setId)) : []
  const previousAnswers = mode === 'replace' ? clone(data.drillSet(setId)?.answers ?? []) : []
  const start = mode === 'replace' ? 0 : data.questionsOfSet(setId).length

  const questions: Question[] = parsed.map((item, index) => ({
    ...item,
    id: newId(),
    setId,
    order: start + index,
    createdAt: stamp,
    updatedAt: stamp
  }))

  return {
    label:
      mode === 'replace'
        ? `Remplacer par ${questions.length} question(s)`
        : `Importer ${questions.length} question(s)`,
    action: 'import',
    entityType: 'question',
    entityId: questions[0]?.id ?? setId,
    sequenceId: setId,
    focus: focusForSet(setId),
    added: questions.length,
    after: clone(questions),
    do: () => {
      for (const question of previous) data.removeQuestion(question.id)
      questions.forEach((question, index) => data.insertQuestion(clone(question), start + index))
    },
    // À rebours : retirer par la fin évite de renuméroter à chaque retrait.
    undo: () => {
      ;[...questions].reverse().forEach((question) => data.removeQuestion(question.id))
      for (const question of previous) data.insertQuestion(clone(question))
      if (mode === 'replace') data.setDrillAnswers(setId, clone(previousAnswers))
    }
  }
}

export function deleteQuestion(id: string): Command {
  const data = useDataStore()
  const question = clone(data.question(id)!)
  const index = data.questionsOfSet(question.setId).findIndex((q) => q.id === id)
  const answer = clone(data.answerOf(question.setId, id) ?? null)

  return {
    label: `Supprimer « ${short(question.prompt)} »`,
    action: 'delete',
    entityType: 'question',
    entityId: id,
    sequenceId: question.setId,
    focus: focusForSet(question.setId),
    before: question,
    do: () => data.removeQuestion(id),
    undo: () => {
      data.insertQuestion(clone(question), index)
      if (answer) data.setDrillAnswer(question.setId, clone(answer))
    }
  }
}

/** Vide une partie de ses questions — et donc de son score en cours. */
export function clearQuestions(setId: string): Command {
  const data = useDataStore()
  const questions = clone(data.questionsOfSet(setId))
  const answers = clone(data.drillSet(setId)?.answers ?? [])

  return {
    label: `Vider la partie (${questions.length} question(s))`,
    action: 'delete',
    entityType: 'question',
    entityId: setId,
    sequenceId: setId,
    focus: focusForSet(setId),
    before: clone({ questions, answers }),
    do: () => {
      for (const question of questions) data.removeQuestion(question.id)
    },
    undo: () => {
      for (const question of questions) data.insertQuestion(clone(question))
      data.setDrillAnswers(setId, clone(answers))
    }
  }
}

// ————————————————————————— Réponses et score —————————————————————————

/**
 * Enregistre une réponse et dit si elle est juste. Hors de la pile
 * d'annulation, volontairement : c'est l'exercice qui avance, pas le document
 * qui change.
 */
export function answerQuestion(setId: string, question: Question, value: string): boolean {
  const data = useDataStore()
  const correct = isCorrect(question, value)
  const answer: DrillAnswer = { questionId: question.id, value, correct, at: now() }
  data.setDrillAnswer(setId, answer)
  return correct
}

/**
 * Range le score courant dans une série archivée, puis remet le compteur à
 * zéro. Rien n'est perdu : les réponses et le résultat restent consultables
 * dans le panneau « Séries ».
 */
export function archiveAndReset(setId: string): DrillRun | null {
  const data = useDataStore()
  const answers = clone(data.drillSet(setId)?.answers ?? [])
  if (answers.length === 0) return null

  const run: DrillRun = {
    id: newId(),
    setId,
    at: now(),
    total: data.questionsOfSet(setId).length,
    answered: answers.length,
    correct: answers.filter((answer) => answer.correct).length,
    answers
  }
  data.insertDrillRun(run)
  data.setDrillAnswers(setId, [])
  return run
}
