/**
 * Lecture et écriture de CSV.
 *
 * Le fichier vient toujours d'ailleurs — d'un LLM, d'un tableur, d'un
 * copier-coller — donc on ne suppose rien : ni le séparateur, ni les fins de
 * ligne, ni l'absence de BOM. Un tableur français écrit des points-virgules,
 * un LLM des virgules ; les deux doivent s'ouvrir sans réglage.
 */

const DELIMITERS = [',', ';', '\t'] as const

/**
 * Devine le séparateur sur la première ligne, celle des en-têtes. On compte
 * hors guillemets : une virgule à l'intérieur d'un champ ne vote pas.
 */
export function detectDelimiter(text: string): string {
  const counts = new Map<string, number>(DELIMITERS.map((d) => [d, 0]))
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') i += 1
      else quoted = !quoted
      continue
    }
    if (quoted) continue
    if (char === '\n') break
    const seen = counts.get(char)
    if (seen !== undefined) counts.set(char, seen + 1)
  }

  let best = ','
  let most = 0
  for (const [delimiter, count] of counts) {
    if (count > most) {
      most = count
      best = delimiter
    }
  }
  return best
}

/**
 * Analyse un CSV en lignes de champs. Les guillemets protègent le séparateur
 * et les sauts de ligne ; `""` à l'intérieur vaut un guillemet littéral.
 * Les lignes entièrement vides sont écartées — un fichier en porte presque
 * toujours une à la fin.
 */
export function parseCsv(input: string, delimiter?: string): string[][] {
  const text = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const sep = delimiter ?? detectDelimiter(text)

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  const endField = (): void => {
    row.push(field)
    field = ''
  }
  const endRow = (): void => {
    endField()
    if (row.some((value) => value.trim() !== '')) rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]

    if (quoted) {
      if (char !== '"') {
        field += char
      } else if (text[i + 1] === '"') {
        field += '"'
        i += 1
      } else {
        quoted = false
      }
      continue
    }

    if (char === '"' && field.trim() === '') {
      // Un guillemet n'ouvre un champ qu'en tête : ailleurs, il est littéral.
      field = ''
      quoted = true
    } else if (char === sep) endField()
    else if (char === '\n') endRow()
    else field += char
  }

  if (field !== '' || row.length > 0) endRow()
  return rows
}

/** Met un champ entre guillemets seulement s'il en a besoin. */
const quote = (value: string, delimiter: string): string => {
  const needs =
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes('\n') ||
    value !== value.trim()
  return needs ? `"${value.replace(/"/g, '""')}"` : value
}

/**
 * Écrit un CSV. Les fins de ligne sont en CRLF et le BOM est posé : c'est ce
 * qu'attend Excel, qui sinon affiche les accents en mojibake.
 */
export function toCsv(rows: string[][], delimiter = ','): string {
  const body = rows
    .map((row) => row.map((value) => quote(value ?? '', delimiter)).join(delimiter))
    .join('\r\n')
  return `﻿${body}\r\n`
}
