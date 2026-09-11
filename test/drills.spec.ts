import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDataStore } from '@/stores/data'
import { useUndoStore } from '@/stores/undo'
import { parseCsv, toCsv } from '@/lib/csv'
import {
  answerQuestion,
  archiveAndReset,
  clearQuestions,
  createDrillSet,
  createDrillType,
  importQuestions,
  isCorrect,
  parseQuestionCsv,
  questionsToCsv,
  seedDrillTypes,
  toNumber
} from '@/lib/drill-commands'
import { deleteProject, deleteSequence } from '@/lib/commands'
import { SEED_TYPES } from '@/lib/drill-prompts'
import type { Question } from '@shared/models'

const HEADER = 'question,type,choix,reponse,explication,lecon,lien_lecon,description'

/** Monte un type et une partie, et rend l'identifiant des deux. */
function setup(): { projectId: string; setId: string } {
  const undo = useUndoStore()
  const data = useDataStore()
  const type = createDrillType('drills', 'Mathématiques')
  undo.run(type)
  const projectId = type.entityId
  const set = createDrillSet(projectId, 'Terminale')
  undo.run(set)
  // La création d'un type pose déjà une première partie ; on travaille sur la nôtre.
  expect(data.sequencesOfProject(projectId)).toHaveLength(2)
  return { projectId, setId: set.entityId }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('lecture du CSV', () => {
  it('rend les champs protégés par des guillemets, virgules comprises', () => {
    const rows = parseCsv('a,b\n"un, deux",trois\n')
    expect(rows).toEqual([
      ['a', 'b'],
      ['un, deux', 'trois']
    ])
  })

  it('accepte le point-virgule des tableurs français', () => {
    expect(parseCsv('a;b\n1;2\n')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
  })

  it('double les guillemets à l’intérieur d’un champ et garde les sauts de ligne', () => {
    expect(parseCsv('a\n"il a dit ""oui""\nensuite"\n')).toEqual([
      ['a'],
      ['il a dit "oui"\nensuite']
    ])
  })

  it('écarte le BOM, les CRLF et les lignes vides', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r\n\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
  })

  it('fait l’aller-retour sans rien perdre', () => {
    const rows = [
      ['question', 'reponse'],
      ['Combien font 2 + 2, en base 10 ?', '4'],
      ['Une "citation"', 'oui']
    ]
    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })
})

describe('import des questions', () => {
  it('lit une question à choix et résout la réponse donnée par sa lettre', () => {
    const csv = `${HEADER}\n"Quel est le sujet ?",choix,"Paul | Marie | Luc",B,"Marie agit.",,,"Grammaire"`
    const { questions, skipped } = parseQuestionCsv(csv)

    expect(skipped).toHaveLength(0)
    expect(questions).toHaveLength(1)
    expect(questions[0].kind).toBe('choice')
    expect(questions[0].choices).toEqual(['Paul', 'Marie', 'Luc'])
    // La lettre est traduite en texte : c'est lui que la correction compare.
    expect(questions[0].answer).toBe('Marie')
    expect(questions[0].description).toBe('Grammaire')
  })

  it('résout aussi un numéro d’option, et garde le texte quand il est exact', () => {
    const csv = `${HEADER}\nQ1,choix,"a | b | c",3,,,,\nQ2,choix,"a | b | c",b,,,,`
    const { questions } = parseQuestionCsv(csv)
    expect(questions.map((q) => q.answer)).toEqual(['c', 'b'])
  })

  it('reconnaît les en-têtes accentués ou nommés autrement', () => {
    const csv = 'énoncé;type;options;réponse;explication;leçon;lien;consigne\n2+2 ?;nombre;;4;;;;\n'
    const { questions } = parseQuestionCsv(csv)
    expect(questions).toHaveLength(1)
    expect(questions[0].prompt).toBe('2+2 ?')
    expect(questions[0].answer).toBe('4')
    expect(questions[0].kind).toBe('number')
  })

  it('écarte les lignes inexploitables en disant lesquelles et pourquoi', () => {
    const csv = [
      HEADER,
      ',nombre,,4,,,,',
      'Sans réponse,nombre,,,,,,',
      'Réponse hors des choix,choix,"a | b",z,,,,',
      'Réponse non numérique,nombre,,beaucoup,,,,',
      'Bonne ligne,nombre,,12,,,,'
    ].join('\n')

    const { questions, skipped } = parseQuestionCsv(csv)
    expect(questions).toHaveLength(1)
    expect(skipped.map((item) => item.row)).toEqual([2, 3, 4, 5])
    expect(skipped[0].reason).toContain('énoncé')
  })

  it('lit un fichier sans en-tête en prenant les colonnes dans l’ordre', () => {
    const { questions } = parseQuestionCsv('2+2 ?,nombre,,4,,,,\n')
    expect(questions).toHaveLength(1)
    expect(questions[0].answer).toBe('4')
  })

  it('exporte ce qui se réimporte à l’identique', () => {
    const { setId } = setup()
    const data = useDataStore()
    const undo = useUndoStore()

    const csv = `${HEADER}\n"Combien, au juste ?",nombre,,4.5,"Parce que.",Leçon,https://fr.wikipedia.org/,Consigne`
    undo.run(importQuestions(setId, parseQuestionCsv(csv).questions))

    const again = parseQuestionCsv(questionsToCsv(data.questionsOfSet(setId)))
    expect(again.questions[0]).toMatchObject({
      prompt: 'Combien, au juste ?',
      kind: 'number',
      answer: '4.5',
      explanation: 'Parce que.',
      lesson: 'Leçon',
      lessonUrl: 'https://fr.wikipedia.org/',
      description: 'Consigne'
    })
  })
})

describe('correction', () => {
  const numeric = (answer: string): Question =>
    ({ kind: 'number', answer, choices: [] }) as unknown as Question

  it('lit un nombre écrit de plusieurs façons', () => {
    expect(toNumber('1 234,5')).toBe(1234.5)
    expect(toNumber('-0.5')).toBe(-0.5)
    expect(toNumber('12%')).toBe(12)
    expect(toNumber('douze')).toBeNull()
  })

  it('compare les nombres comme des nombres, pas comme du texte', () => {
    expect(isCorrect(numeric('0.5'), '0,50')).toBe(true)
    expect(isCorrect(numeric('4'), '4.0')).toBe(true)
    expect(isCorrect(numeric('4'), '4.1')).toBe(false)
    expect(isCorrect(numeric('4'), '')).toBe(false)
  })

  it('ne fait payer ni l’accent ni la majuscule sur une réponse textuelle', () => {
    const choice = {
      kind: 'choice',
      answer: 'Éléphant',
      choices: ['Éléphant', 'Souris']
    } as unknown as Question
    expect(isCorrect(choice, 'elephant')).toBe(true)
    expect(isCorrect(choice, 'Souris')).toBe(false)
  })
})

describe('score et séries', () => {
  const csv = `${HEADER}\nQ1,nombre,,1,,,,\nQ2,nombre,,2,,,,\nQ3,nombre,,3,,,,`

  it('compte les justes sur les répondues, sur le total', () => {
    const { setId } = setup()
    const data = useDataStore()
    useUndoStore().run(importQuestions(setId, parseQuestionCsv(csv).questions))
    const [q1, q2] = data.questionsOfSet(setId)

    answerQuestion(setId, q1, '1')
    answerQuestion(setId, q2, '9')

    expect(data.scoreOfSet(setId)).toEqual({ correct: 1, answered: 2, total: 3 })
  })

  it('répondre deux fois à la même question ne compte qu’une fois', () => {
    const { setId } = setup()
    const data = useDataStore()
    useUndoStore().run(importQuestions(setId, parseQuestionCsv(csv).questions))
    const [q1] = data.questionsOfSet(setId)

    answerQuestion(setId, q1, '9')
    answerQuestion(setId, q1, '1')

    expect(data.scoreOfSet(setId)).toEqual({ correct: 1, answered: 1, total: 3 })
  })

  it('archive le score et les réponses avant de remettre à zéro', () => {
    const { setId } = setup()
    const data = useDataStore()
    useUndoStore().run(importQuestions(setId, parseQuestionCsv(csv).questions))
    const [q1, q2] = data.questionsOfSet(setId)
    answerQuestion(setId, q1, '1')
    answerQuestion(setId, q2, '9')

    const run = archiveAndReset(setId)

    expect(run).toMatchObject({ correct: 1, answered: 2, total: 3 })
    expect(run?.answers.map((answer) => answer.value)).toEqual(['1', '9'])
    expect(data.scoreOfSet(setId)).toEqual({ correct: 0, answered: 0, total: 3 })
    expect(data.runsOfSet(setId)).toHaveLength(1)
  })

  it('ne crée pas de série vide', () => {
    const { setId } = setup()
    expect(archiveAndReset(setId)).toBeNull()
    expect(useDataStore().runsOfSet(setId)).toHaveLength(0)
  })

  it('supprimer une question retire sa réponse du score', () => {
    const { setId } = setup()
    const data = useDataStore()
    const undo = useUndoStore()
    undo.run(importQuestions(setId, parseQuestionCsv(csv).questions))
    const [q1] = data.questionsOfSet(setId)
    answerQuestion(setId, q1, '1')

    data.removeQuestion(q1.id)
    expect(data.scoreOfSet(setId)).toEqual({ correct: 0, answered: 0, total: 2 })
  })
})

describe('annulation', () => {
  const csv = `${HEADER}\nQ1,nombre,,1,,,,\nQ2,nombre,,2,,,,`

  it('retire tout un import en un seul Ctrl+Z', () => {
    const { setId } = setup()
    const data = useDataStore()
    const undo = useUndoStore()

    undo.run(importQuestions(setId, parseQuestionCsv(csv).questions))
    expect(data.questionsOfSet(setId)).toHaveLength(2)

    undo.undo()
    expect(data.questionsOfSet(setId)).toHaveLength(0)

    undo.redo()
    expect(data.questionsOfSet(setId).map((q) => q.prompt)).toEqual(['Q1', 'Q2'])
  })

  it('un remplacement annulé rend les questions ET les réponses d’avant', () => {
    const { setId } = setup()
    const data = useDataStore()
    const undo = useUndoStore()

    undo.run(importQuestions(setId, parseQuestionCsv(csv).questions))
    answerQuestion(setId, data.questionsOfSet(setId)[0], '1')

    undo.run(
      importQuestions(setId, parseQuestionCsv(`${HEADER}\nQ3,nombre,,3,,,,`).questions, 'replace')
    )
    expect(data.questionsOfSet(setId).map((q) => q.prompt)).toEqual(['Q3'])
    expect(data.scoreOfSet(setId).answered).toBe(0)

    undo.undo()
    expect(data.questionsOfSet(setId).map((q) => q.prompt)).toEqual(['Q1', 'Q2'])
    expect(data.scoreOfSet(setId)).toEqual({ correct: 1, answered: 1, total: 2 })
  })

  it('vider une partie puis annuler la rend intacte', () => {
    const { setId } = setup()
    const data = useDataStore()
    const undo = useUndoStore()
    undo.run(importQuestions(setId, parseQuestionCsv(csv).questions))
    answerQuestion(setId, data.questionsOfSet(setId)[1], '2')

    undo.run(clearQuestions(setId))
    expect(data.questionsOfSet(setId)).toHaveLength(0)

    undo.undo()
    expect(data.questionsOfSet(setId)).toHaveLength(2)
    expect(data.scoreOfSet(setId)).toEqual({ correct: 1, answered: 1, total: 2 })
  })

  it('supprimer une partie emporte ses questions et ses séries, et les ramène', () => {
    const { setId } = setup()
    const data = useDataStore()
    const undo = useUndoStore()
    undo.run(importQuestions(setId, parseQuestionCsv(csv).questions))
    answerQuestion(setId, data.questionsOfSet(setId)[0], '1')
    archiveAndReset(setId)

    undo.run(deleteSequence(setId, 'partie'))
    expect(data.questions).toHaveLength(0)
    expect(data.drillSets.some((set) => set.id === setId)).toBe(false)
    expect(data.drillRuns).toHaveLength(0)

    undo.undo()
    expect(data.questionsOfSet(setId)).toHaveLength(2)
    expect(data.runsOfSet(setId)).toHaveLength(1)
  })

  it('supprimer un type emporte son guide et ses parties, et les ramène', () => {
    const { projectId, setId } = setup()
    const data = useDataStore()
    const undo = useUndoStore()
    undo.run(importQuestions(setId, parseQuestionCsv(csv).questions))

    undo.run(deleteProject(projectId))
    expect(data.drillTypes).toHaveLength(0)
    expect(data.drillSets).toHaveLength(0)
    expect(data.questions).toHaveLength(0)

    undo.undo()
    expect(data.drillType(projectId)?.spec).toContain('Domaine')
    expect(data.drillSets).toHaveLength(2)
    expect(data.questionsOfSet(setId)).toHaveLength(2)
  })
})

describe('types de départ', () => {
  it('crée les cinq types, leurs parties et leurs guides en une action', () => {
    const data = useDataStore()
    const undo = useUndoStore()

    undo.run(seedDrillTypes('drills'))

    const projects = data.projectsOfTool('drills')
    expect(projects.map((project) => project.name)).toEqual(SEED_TYPES.map((seed) => seed.name))
    for (const project of projects) {
      expect(data.drillType(project.id)?.spec.length).toBeGreaterThan(50)
      const seed = SEED_TYPES.find((item) => item.name === project.name)!
      expect(data.sequencesOfProject(project.id).map((part) => part.name)).toEqual(
        seed.parts.map((part) => part.name)
      )
    }
    // Seules les mathématiques ont plusieurs parties au départ.
    const maths = projects.find((project) => project.name === 'Mathématiques')!
    expect(data.sequencesOfProject(maths.id)).toHaveLength(3)

    undo.undo()
    expect(data.projectsOfTool('drills')).toHaveLength(0)
    expect(data.drillSets).toHaveLength(0)
  })

  it('ne recrée pas un type déjà présent', () => {
    const data = useDataStore()
    const undo = useUndoStore()
    undo.run(createDrillType('drills', 'Stratégie'))
    undo.run(seedDrillTypes('drills'))

    const names = data.projectsOfTool('drills').map((project) => project.name)
    expect(names.filter((name) => name === 'Stratégie')).toHaveLength(1)
    expect(names).toHaveLength(SEED_TYPES.length)
  })
})

describe('jeux de données livrés', () => {
  const SAMPLES = resolve(process.cwd(), 'samples')

  /** Ce que chaque fichier de `samples/` doit contenir, une fois importé. */
  const EXPECTED: Record<string, number> = {
    'exercices-test.csv': 6,
    'raisonnement-numerique.csv': 20,
    'raisonnement-logique-pratique.csv': 20,
    'strategie.csv': 20,
    'communication.csv': 20,
    'maths-premiere.csv': 5,
    'maths-terminale.csv': 5,
    'maths-physique-premiere-annee.csv': 5
  }

  const read = (name: string): string => readFileSync(resolve(SAMPLES, name), 'utf-8')

  it('le dossier ne contient que les fichiers attendus', () => {
    expect(readdirSync(SAMPLES).sort()).toEqual(Object.keys(EXPECTED).sort())
  })

  it.each(Object.entries(EXPECTED))('%s entre en entier, sans ligne écartée', (name, count) => {
    const { questions, skipped } = parseQuestionCsv(read(name))
    expect(skipped, JSON.stringify(skipped)).toEqual([])
    expect(questions).toHaveLength(count)
  })

  it.each(Object.keys(EXPECTED))('%s est corrigeable : la réponse attendue est juste', (name) => {
    for (const question of parseQuestionCsv(read(name)).questions) {
      const full = { ...question, id: 'x', setId: 'x', order: 0, createdAt: '', updatedAt: '' }
      // Ce que le CSV annonce comme correct doit être reconnu comme correct.
      expect(isCorrect(full, question.answer), question.prompt).toBe(true)
      if (question.kind === 'number') expect(toNumber(question.answer)).not.toBeNull()
      else expect(question.choices.length).toBeGreaterThanOrEqual(3)
      expect(question.explanation.length, question.prompt).toBeGreaterThan(30)
    }
  })

  it('chaque exercice de mathématiques porte sa leçon', () => {
    for (const name of Object.keys(EXPECTED).filter((file) => file.startsWith('maths-'))) {
      for (const question of parseQuestionCsv(read(name)).questions) {
        expect(question.lesson.length, `${name} — ${question.prompt}`).toBeGreaterThan(80)
      }
    }
  })

  it('les liens de leçon mènent vers une page francophone ou anglophone', () => {
    const links = Object.keys(EXPECTED)
      .flatMap((name) => parseQuestionCsv(read(name)).questions)
      .map((question) => question.lessonUrl)
      .filter(Boolean)

    expect(links.length).toBeGreaterThan(0)
    for (const link of links) expect(link).toMatch(/^https:\/\/(fr|en)\.wikipedia\.org\//)
  })
})
