import { describe, expect, it } from 'vitest'
import { fold, fuzzy, fuzzyAll, segments } from '@/lib/fuzzy'
import { excerptOf, occurrences, searchLines, termsOf } from '@/lib/search'
import { newId, now } from '@/lib/id'
import type { Line } from '@shared/models'

const makeLine = (content: string, patch: Partial<Line> = {}): Line => ({
  id: newId(),
  sequenceId: 'seq-1',
  content,
  comment: '',
  hidden: false,
  masked: false,
  order: 0,
  createdAt: now(),
  updatedAt: now(),
  ...patch
})

/** Le texte reconstitué à partir des morceaux, pour vérifier qu'on n'en perd pas. */
const joined = (parts: { text: string }[]): string => parts.map((part) => part.text).join('')

describe('repli des textes', () => {
  it('ne change jamais la longueur, sans quoi les surbrillances glisseraient', () => {
    for (const text of ['Séquence', 'ÀÉÎÔÛ', 'Straße', 'déjà-vu', 'ĄĆĘŁŃ']) {
      expect(fold(text)).toHaveLength(text.length)
    }
  })

  it('efface accents et capitales', () => {
    expect(fold('Réplication BDD')).toBe('replication bdd')
  })
})

describe('palette — appariement approximatif', () => {
  it('trouve une sous-chaîne et la surligne entièrement', () => {
    const match = fuzzy('Backup production', 'prod')
    expect(match).not.toBeNull()
    expect(match!.hits).toEqual([7, 8, 9, 10])
  })

  it('trouve une sous-séquence éparpillée', () => {
    expect(fuzzy('Backup production', 'bkp')).not.toBeNull()
  })

  it('rejette ce qui manque une lettre', () => {
    expect(fuzzy('Backup production', 'bkz')).toBeNull()
  })

  it('ignore les accents de la saisie comme du texte', () => {
    expect(fuzzy('Déploiement', 'deplo')).not.toBeNull()
    expect(fuzzy('Deploiement', 'déplo')).not.toBeNull()
  })

  it('place le début du nom devant le milieu', () => {
    const start = fuzzy('prod — bascule', 'prod')!
    const middle = fuzzy('bascule prod finale', 'prod')!
    expect(start.score).toBeGreaterThan(middle.score)
  })

  it('place la sous-chaîne devant la sous-séquence', () => {
    const direct = fuzzy('Backup prod', 'prod')!
    const scattered = fuzzy('Purge reconstruction ordonnée détaillée', 'prod')!
    expect(direct.score).toBeGreaterThan(scattered.score)
  })

  it('exige que chaque mot de la saisie porte, dans n’importe quel ordre', () => {
    expect(fuzzyAll('Backup prod', 'prod backup')).not.toBeNull()
    expect(fuzzyAll('Backup prod', 'prod recette')).toBeNull()
  })

  it('rend tout le texte quand rien n’est surligné', () => {
    expect(segments('Backup', [])).toEqual([{ text: 'Backup', hit: false }])
  })

  it('découpe en alternant les morceaux retenus', () => {
    expect(segments('abcd', [1, 2])).toEqual([
      { text: 'a', hit: false },
      { text: 'bc', hit: true },
      { text: 'd', hit: false }
    ])
  })
})

describe('recherche de mots dans les lignes', () => {
  it('découpe la saisie en mots repliés', () => {
    expect(termsOf('  Déploiement   PROD ')).toEqual(['deploiement', 'prod'])
  })

  it('marque toutes les occurrences, pas seulement la première', () => {
    expect(occurrences('git push git pull', ['git'])).toEqual([0, 1, 2, 9, 10, 11])
  })

  it('exige tous les termes sur la même ligne', () => {
    expect(occurrences('pg_dump base', ['pg_dump', 'base'])).not.toBeNull()
    expect(occurrences('pg_dump base', ['pg_dump', 'gzip'])).toBeNull()
  })

  it('numérote les résultats comme la séquence les affiche', () => {
    const lines = [makeLine('cd /srv'), makeLine('pg_dump app'), makeLine('gzip app.sql')]
    const hits = searchLines(lines, termsOf('app'))
    expect(hits.map((hit) => hit.position)).toEqual([2, 3])
  })

  it('n’expose jamais le contenu d’une ligne masquée', () => {
    const lines = [makeLine('mot de passe : hunter2', { masked: true }), makeLine('echo ok')]
    expect(searchLines(lines, termsOf('hunter2'))).toEqual([])
  })

  it('ne rend rien pour une saisie vide', () => {
    expect(searchLines([makeLine('echo ok')], termsOf('   '))).toEqual([])
  })

  it('recentre un extrait long autour du terme trouvé', () => {
    const text = `${'x'.repeat(400)} cible ${'y'.repeat(400)}`
    const hits = occurrences(text, ['cible'])!
    const parts = excerptOf(text, hits)
    const rendered = joined(parts)

    expect(rendered).toContain('cible')
    expect(rendered.length).toBeLessThan(200)
    expect(rendered.startsWith('…')).toBe(true)
    expect(rendered.endsWith('…')).toBe(true)
  })

  it('laisse une ligne courte intacte', () => {
    const text = 'pg_dump app > app.sql'
    expect(joined(excerptOf(text, occurrences(text, ['app'])!))).toBe(text)
  })
})
