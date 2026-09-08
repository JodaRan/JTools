import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDataStore } from '@/stores/data'
import { createLines, pasteIntoLine } from '@/lib/commands'
import { isMultiline, pasteSummary, splitPastedText } from '@/lib/paste'
import { newId, now } from '@/lib/id'
import type { Line } from '@shared/models'

const SEQ = 'seq-paste'

const makeLine = (content: string, order: number): Line => ({
  id: newId(),
  sequenceId: SEQ,
  content,
  comment: '',
  hidden: false,
  masked: false,
  order,
  createdAt: now(),
  updatedAt: now()
})

describe('découpage d’un texte collé', () => {
  it('ne se déclenche que sur un texte à plusieurs lignes', () => {
    expect(isMultiline('une seule ligne')).toBe(false)
    expect(isMultiline('deux\nlignes')).toBe(true)
    // Un fichier Windows arrive en CRLF.
    expect(isMultiline('deux\r\nlignes')).toBe(true)
  })

  it('normalise les fins de ligne Windows et Mac historiques', () => {
    expect(splitPastedText('a\r\nb\rc\nd').lines).toEqual(['a', 'b', 'c', 'd'])
  })

  it('garde les lignes vides du milieu, qui font séparateur', () => {
    expect(splitPastedText('git pull\n\npnpm build').lines).toEqual([
      'git pull',
      '',
      'pnpm build'
    ])
  })

  it('écarte le saut de ligne final que porte presque tout fichier', () => {
    const split = splitPastedText('git pull\npnpm build\n\n')
    expect(split.lines).toEqual(['git pull', 'pnpm build'])
    expect(split.trimmed).toBe(2)
  })

  it('garde un saut de ligne initial, qui veut dire « nouvelle ligne ici »', () => {
    // Sans ça, coller « \ntexte » au bout d'une ligne la rallongerait au lieu
    // d'en ouvrir une nouvelle.
    expect(splitPastedText('\nsha256sum dump.sql.gz').lines).toEqual([
      '',
      'sha256sum dump.sql.gz'
    ])
  })

  it('ne réduit jamais à rien', () => {
    expect(splitPastedText('\n\n\n').lines).toEqual([''])
  })

  it('retire les blancs de fin mais garde l’indentation', () => {
    const split = splitPastedText('  - name: web   \n    image: nginx')
    expect(split.lines).toEqual(['  - name: web', '    image: nginx'])
  })

  it('résume ce qui a été fait', () => {
    expect(pasteSummary({ lines: ['a'], trimmed: 0 })).toBe('1 ligne ajoutée.')
    expect(pasteSummary({ lines: ['a', 'b'], trimmed: 1 })).toBe('2 lignes ajoutées.')
  })
})

describe('collage — création en bloc', () => {
  let data: ReturnType<typeof useDataStore>
  const contents = (): string[] => data.linesOfSequence(SEQ).map((line) => line.content)

  beforeEach(() => {
    setActivePinia(createPinia())
    data = useDataStore()
  })

  it('ajoute les lignes à la suite, dans l’ordre du texte', () => {
    data.insertLine(makeLine('déjà là', 0))
    createLines(SEQ, ['un', 'deux', 'trois']).do()
    expect(contents()).toEqual(['déjà là', 'un', 'deux', 'trois'])
  })

  it('les insère à un rang donné sans mélanger l’ordre', () => {
    for (const [index, text] of ['a', 'b'].entries()) data.insertLine(makeLine(text, index))
    createLines(SEQ, ['x', 'y'], 1).do()
    expect(contents()).toEqual(['a', 'x', 'y', 'b'])
  })

  it('s’annule d’un seul coup', () => {
    data.insertLine(makeLine('a', 0))
    const command = createLines(SEQ, ['x', 'y', 'z'])

    command.do()
    expect(contents()).toEqual(['a', 'x', 'y', 'z'])

    // C'est tout l'intérêt : un Ctrl+Z, pas trois.
    command.undo()
    expect(contents()).toEqual(['a'])
  })

  it('expose les identifiants créés, pour poser le focus ensuite', () => {
    const command = createLines(SEQ, ['un', 'deux'])
    command.do()
    expect(command.entityIds).toHaveLength(2)
    expect(data.line(command.entityIds[1])?.content).toBe('deux')
  })
})

describe('collage — au milieu d’une ligne', () => {
  let data: ReturnType<typeof useDataStore>
  const contents = (): string[] => data.linesOfSequence(SEQ).map((line) => line.content)

  beforeEach(() => {
    setActivePinia(createPinia())
    data = useDataStore()
  })

  it('coupe la ligne au curseur, comme un éditeur de texte', () => {
    const line = makeLine('DEBUTFIN', 0)
    data.insertLine(line)
    data.insertLine(makeLine('suivante', 1))

    // Curseur entre DEBUT et FIN, on colle trois morceaux.
    pasteIntoLine(line.id, 'DEBUT', 'FIN', ['un', 'deux', 'trois']).do()

    expect(contents()).toEqual(['DEBUTun', 'deux', 'troisFIN', 'suivante'])
  })

  it('restaure exactement l’état d’avant à l’annulation', () => {
    const line = makeLine('DEBUTFIN', 0)
    data.insertLine(line)
    const command = pasteIntoLine(line.id, 'DEBUT', 'FIN', ['un', 'deux'])

    command.do()
    expect(contents()).toEqual(['DEBUTun', 'deuxFIN'])

    command.undo()
    expect(contents()).toEqual(['DEBUTFIN'])
  })

  it('se réduit à une modification quand il ne reste qu’un morceau', () => {
    // Le cas d'un collage dont toutes les lignes sauf une étaient vides.
    const line = makeLine('DEBUTFIN', 0)
    data.insertLine(line)
    const command = pasteIntoLine(line.id, 'DEBUT', 'FIN', ['seul'])

    command.do()
    expect(contents()).toEqual(['DEBUTseulFIN'])

    command.undo()
    expect(contents()).toEqual(['DEBUTFIN'])
  })
})
