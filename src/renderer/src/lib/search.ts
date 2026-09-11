/**
 * Recherche de mots dans les lignes des séquences.
 *
 * Rien d'approximatif ici, contrairement à la palette : on cherche un mot
 * qu'on sait avoir écrit — un nom de serveur, une option de commande — et un
 * résultat approché ne rendrait service à personne. Chaque mot de la saisie
 * doit être présent, dans n'importe quel ordre.
 */
import { fold, segments, type Segment } from '@/lib/fuzzy'
import type { Line } from '@shared/models'

export interface LineHit {
  line: Line
  /** Rang de la ligne dans sa séquence, tel qu'il s'affiche (à partir de 1). */
  position: number
  /** Extrait recentré sur la trouvaille, avec les termes surlignés. */
  excerpt: Segment[]
}

export interface SequenceHits {
  sequenceId: string
  sequenceName: string
  projectId: string
  projectName: string
  hits: LineHit[]
}

/** Les mots de la saisie, repliés une fois pour toutes. */
export const termsOf = (query: string): string[] =>
  fold(query).trim().split(/\s+/).filter(Boolean)

/**
 * Toutes les positions des termes dans le texte, ou `null` s'il en manque un.
 * Chaque occurrence compte : surligner seulement la première donnerait à
 * croire que les autres n'en sont pas.
 */
export function occurrences(text: string, terms: string[]): number[] | null {
  if (terms.length === 0) return null
  const hay = fold(text)
  const hits: number[] = []

  for (const term of terms) {
    let at = hay.indexOf(term)
    if (at === -1) return null
    while (at !== -1) {
      for (let i = 0; i < term.length; i += 1) hits.push(at + i)
      at = hay.indexOf(term, at + 1)
    }
  }
  return hits
}

/** Au-delà, on ne montre qu'une fenêtre autour du premier terme trouvé. */
const EXCERPT = 180
const LEAD = 40

export function excerptOf(text: string, hits: number[]): Segment[] {
  if (text.length <= EXCERPT) return segments(text, hits)

  const first = Math.min(...hits)
  const start = Math.max(0, first - LEAD)
  const end = Math.min(text.length, start + EXCERPT)

  const window = segments(
    text.slice(start, end),
    hits.filter((at) => at >= start && at < end).map((at) => at - start)
  )
  if (start > 0) window.unshift({ text: '…', hit: false })
  if (end < text.length) window.push({ text: '…', hit: false })
  return window
}

/**
 * Les lignes d'une séquence qui portent tous les termes.
 *
 * Une ligne masquée est écartée : son contenu ne doit apparaître nulle part
 * sans le geste explicite de l'œil. Les lignes cachées le sont aussi, mais
 * pour une autre raison — il n'y aurait nulle part où les montrer une fois la
 * séquence ouverte. `lines` est donc la liste visible, dans l'ordre affiché.
 */
export function searchLines(lines: Line[], terms: string[]): LineHit[] {
  if (terms.length === 0) return []

  const out: LineHit[] = []
  lines.forEach((line, index) => {
    if (line.masked) return
    const hits = occurrences(line.content, terms)
    if (!hits) return
    out.push({ line, position: index + 1, excerpt: excerptOf(line.content, hits) })
  })
  return out
}
