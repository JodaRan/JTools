/**
 * Découpage d'un texte collé en lignes de séquence.
 *
 * Le cas visé est le copier depuis un fichier — script shell, liste de
 * commandes, export d'une autre séquence. C'est l'exact inverse de « copier
 * toute la séquence », qui joint les lignes par des sauts de ligne.
 */

/** Vrai si le texte porte plus d'une ligne — seul cas où l'on intercepte le collage. */
export const isMultiline = (text: string): boolean => /\r|\n/.test(text)

export interface PasteSplit {
  lines: string[]
  /** Lignes vides de fin écartées, uniquement pour la trace. */
  trimmed: number
}

/**
 * Un saut de ligne dans le texte donne une ligne dans la séquence, sans
 * exception : c'est la règle la plus prévisible, elle rend l'aller-retour
 * copier/coller exactement fidèle, et une ligne vide fait un séparateur
 * commode entre deux étapes.
 *
 * Les blancs de fin de chaque ligne sont retirés, mais l'indentation de début
 * est préservée : elle peut être signifiante (YAML, blocs de script).
 *
 * Seule exception, les lignes vides *terminales* : presque tout fichier finit
 * par un saut de ligne, et ce dernier ne veut pas dire « ajoute une ligne
 * vide ». Les vides de tête et du milieu, eux, sont gardés — dans un collage
 * au milieu d'une ligne, un saut de ligne initial signifie précisément
 * « ouvre une nouvelle ligne ici ».
 */
export function splitPastedText(text: string): PasteSplit {
  const all = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))

  let end = all.length
  while (end > 1 && all[end - 1] === '') end -= 1

  return { lines: all.slice(0, end), trimmed: all.length - end }
}

/** Phrase de retour : « 12 lignes ajoutées. » */
export function pasteSummary(split: PasteSplit): string {
  const plural = split.lines.length > 1 ? 's' : ''
  return `${split.lines.length} ligne${plural} ajoutée${plural}.`
}
