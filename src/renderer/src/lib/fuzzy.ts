/**
 * Appariement approximatif, pour la palette « Ctrl+P ».
 *
 * Deux façons de trouver, dans cet ordre : la sous-chaîne exacte — de loin le
 * cas courant, on tape le début du nom — puis la sous-séquence, qui laisse
 * « bkp » atteindre « Backup prod ». Le score n'a pas de sens absolu ; il ne
 * sert qu'à ranger les résultats les uns par rapport aux autres.
 */

/** Morceau de texte, retenu par la recherche ou non, pour la surbrillance. */
export interface Segment {
  text: string
  hit: boolean
}

export interface Match {
  score: number
  /** Index des caractères retenus dans le texte d'origine, croissants. */
  hits: number[]
}

const BOUNDARY = /[\s\-_/\.:([]/

/** Un début de mot vaut mieux qu'un milieu : « prod » dans « backup-prod ». */
const startsWord = (text: string, index: number): boolean =>
  index === 0 || BOUNDARY.test(text[index - 1])

/**
 * Version repliée d'un texte : minuscules, sans accents, et de longueur
 * strictement identique à l'original. C'est cette dernière propriété qui
 * compte — les index trouvés ici servent à surligner le texte non replié.
 */
export function fold(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const plain = char
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
    // Un repli qui changerait la longueur décalerait toutes les surbrillances.
    out += plain.length === 1 ? plain : char
  }
  return out
}

/** Appariement d'un seul mot. `null` quand le texte ne le contient pas. */
export function fuzzy(text: string, term: string): Match | null {
  const needle = fold(term)
  if (!needle) return { score: 0, hits: [] }
  const hay = fold(text)

  const direct = hay.indexOf(needle)
  if (direct !== -1) {
    const hits = Array.from({ length: needle.length }, (_, index) => direct + index)
    // Contigu passe toujours devant éparpillé, et le début du nom devant la fin.
    const score = 800 - Math.min(direct, 200) + (startsWord(text, direct) ? 100 : 0)
    return { score, hits }
  }

  const hits: number[] = []
  let from = 0
  for (const char of needle) {
    const at = hay.indexOf(char, from)
    if (at === -1) return null
    hits.push(at)
    from = at + 1
  }

  let score = 0
  hits.forEach((at, index) => {
    if (index > 0 && at === hits[index - 1] + 1) score += 8
    if (startsWord(text, at)) score += 10
  })
  // Plus les lettres sont dispersées, moins l'appariement est convaincant.
  const spread = hits[hits.length - 1] - hits[0] - hits.length + 1
  return { score: score - spread, hits }
}

/**
 * Appariement de la saisie entière : chaque mot doit porter, où qu'il soit.
 * « prod backup » trouve donc « Backup prod » aussi bien que l'inverse.
 */
export function fuzzyAll(text: string, query: string): Match | null {
  const terms = query.trim().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return { score: 0, hits: [] }

  const hits = new Set<number>()
  let score = 0
  for (const term of terms) {
    const match = fuzzy(text, term)
    if (!match) return null
    score += match.score
    for (const at of match.hits) hits.add(at)
  }
  return { score, hits: [...hits].sort((a, b) => a - b) }
}

/** Découpe un texte en morceaux surlignés ou non, prêts à l'affichage. */
export function segments(text: string, hits: number[]): Segment[] {
  if (!text) return []
  if (hits.length === 0) return [{ text, hit: false }]

  const marked = new Set(hits)
  const out: Segment[] = []
  for (let i = 0; i < text.length; i += 1) {
    const hit = marked.has(i)
    const last = out[out.length - 1]
    if (last && last.hit === hit) last.text += text[i]
    else out.push({ text: text[i], hit })
  }
  return out
}
