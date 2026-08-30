import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDataStore } from '@/stores/data'
import { newId, now } from '@/lib/id'
import type { Line } from '@shared/models'

const makeLine = (sequenceId: string, content: string): Line => ({
  id: newId(),
  sequenceId,
  content,
  comment: '',
  hidden: false,
  masked: false,
  order: 0,
  createdAt: now(),
  updatedAt: now()
})

describe('store de données — ordre des lignes', () => {
  const SEQ = 'seq-1'
  let data: ReturnType<typeof useDataStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    data = useDataStore()
  })

  const contents = (): string[] => data.linesOfSequence(SEQ).map((line) => line.content)

  it('empile les ajouts dans l’ordre de saisie', () => {
    for (const text of ['a', 'b', 'c']) data.insertLine(makeLine(SEQ, text))
    expect(contents()).toEqual(['a', 'b', 'c'])
    expect(data.linesOfSequence(SEQ).map((l) => l.order)).toEqual([0, 1, 2])
  })

  it('insère à la position demandée sans trouer la numérotation', () => {
    for (const text of ['a', 'b', 'c']) data.insertLine(makeLine(SEQ, text))
    data.insertLine(makeLine(SEQ, 'bis'), 1)
    expect(contents()).toEqual(['a', 'bis', 'b', 'c'])
    expect(data.linesOfSequence(SEQ).map((l) => l.order)).toEqual([0, 1, 2, 3])
  })

  it('resserre les rangs après une suppression', () => {
    for (const text of ['a', 'b', 'c']) data.insertLine(makeLine(SEQ, text))
    const middle = data.linesOfSequence(SEQ)[1]
    data.removeLine(middle.id)
    expect(contents()).toEqual(['a', 'c'])
    expect(data.linesOfSequence(SEQ).map((l) => l.order)).toEqual([0, 1])
  })

  it('applique un ordre explicite venu du glisser-déposer', () => {
    for (const text of ['a', 'b', 'c']) data.insertLine(makeLine(SEQ, text))
    const [a, b, c] = data.linesOfSequence(SEQ)
    data.reorderLines(SEQ, [c.id, a.id, b.id])
    expect(contents()).toEqual(['c', 'a', 'b'])
  })

  it('ne mélange pas les lignes de séquences différentes', () => {
    data.insertLine(makeLine(SEQ, 'a'))
    data.insertLine(makeLine('seq-2', 'autre'))
    data.insertLine(makeLine(SEQ, 'b'))
    expect(contents()).toEqual(['a', 'b'])
    expect(data.linesOfSequence('seq-2').map((l) => l.content)).toEqual(['autre'])
  })

  it('sépare les lignes visibles des lignes cachées', () => {
    for (const text of ['a', 'b', 'c']) data.insertLine(makeLine(SEQ, text))
    const middle = data.linesOfSequence(SEQ)[1]
    data.patchLine(middle.id, { hidden: true })
    expect(data.visibleLines(SEQ).map((l) => l.content)).toEqual(['a', 'c'])
    expect(data.hiddenLines(SEQ).map((l) => l.content)).toEqual(['b'])
  })
})

describe('store de données — lignes masquées', () => {
  const SEQ = 'seq-mask'
  let data: ReturnType<typeof useDataStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    data = useDataStore()
  })

  it('sépare masquées et cachées, qui sont deux notions distinctes', () => {
    const [secret, dropped, plain] = ['clé', 'obsolète', 'ls -la'].map((text) =>
      makeLine(SEQ, text)
    )
    for (const line of [secret, dropped, plain]) data.insertLine(line)

    data.patchLine(secret.id, { masked: true })
    data.patchLine(dropped.id, { hidden: true })

    expect(data.maskedLines(SEQ).map((l) => l.content)).toEqual(['clé'])
    expect(data.hiddenLines(SEQ).map((l) => l.content)).toEqual(['obsolète'])
    // Une ligne masquée reste dans la liste : c'est tout l'intérêt.
    expect(data.visibleLines(SEQ).map((l) => l.content)).toEqual(['clé', 'ls -la'])
  })

  it('cumule les deux états sur une même ligne', () => {
    const line = makeLine(SEQ, 'mot de passe')
    data.insertLine(line)
    data.patchLine(line.id, { masked: true, hidden: true })

    expect(data.maskedLines(SEQ)).toHaveLength(1)
    expect(data.hiddenLines(SEQ)).toHaveLength(1)
    expect(data.visibleLines(SEQ)).toHaveLength(0)
  })
})
