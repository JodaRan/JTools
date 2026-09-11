import { defineAsyncComponent, type Component } from 'vue'
import IconTerminal from '~icons/lucide/terminal'
import IconKanban from '~icons/lucide/square-kanban'
import IconBrain from '~icons/lucide/brain'

/**
 * Catalogue des outils. Ce n'est pas de la donnée : un outil est du code, et
 * en ajouter un se fait ici. Chaque outil apporte sa propre « vue finale »,
 * celle qu'on ouvre dans un onglet, et les mots qu'il emploie — la coquille
 * dit « tableau » ou « séquence » selon l'outil, jamais un terme générique.
 */
export interface ToolDefinition {
  id: string
  name: string
  description: string
  icon: Component
  /** Libellés du niveau intermédiaire, pour rester juste selon l'outil. */
  projectLabel: string
  sequenceLabel: string
  /** Ce qu'on compte dans un projet : « 3 séquence(s) », « 2 tableau(x) ». */
  sequenceCounted: string
  /** Ce qu'on compte dans une séquence : « 12 ligne(s) », « 40 tâche(s) ». */
  itemCounted: string
  /** Invite du champ de création, dans la liste des projets. */
  projectPlaceholder: string
  /** Invite du champ de création, dans la liste des séquences. */
  createPlaceholder: string
  /**
   * L'outil range-t-il son contenu en lignes de texte ? C'est ce qui décide de
   * la recherche de mots (Ctrl+F) : un tableau et une série d'exercices ont
   * leur propre façon de chercher, et une seconde recherche mentirait.
   */
  searchesLines: boolean
  view: Component
}

export const tools: ToolDefinition[] = [
  {
    id: 'sequences',
    name: 'Séquences',
    description: 'Listes de commandes à copier-coller, par projet.',
    icon: IconTerminal,
    projectLabel: 'projet',
    sequenceLabel: 'séquence',
    sequenceCounted: 'séquence(s)',
    itemCounted: 'ligne(s)',
    projectPlaceholder: 'Nouveau projet — tapez un nom puis Entrée',
    createPlaceholder: 'Nouvelle séquence — tapez un nom puis Entrée',
    searchesLines: true,
    view: defineAsyncComponent(() => import('@/views/FinalInputView.vue'))
  },
  {
    id: 'tasks',
    name: 'Tâches',
    description: 'Tableaux kanban : colonnes, priorités, glisser-déposer.',
    icon: IconKanban,
    projectLabel: 'projet',
    sequenceLabel: 'tableau',
    sequenceCounted: 'tableau(x)',
    itemCounted: 'tâche(s)',
    projectPlaceholder: 'Nouveau projet — tapez un nom puis Entrée',
    createPlaceholder: 'Nouveau tableau — tapez un nom puis Entrée',
    searchesLines: false,
    view: defineAsyncComponent(() => import('@/views/BoardView.vue'))
  },
  {
    id: 'drills',
    name: 'Exercices',
    description: 'Entraînement mental : séries de questions importées en CSV, corrigées et notées.',
    icon: IconBrain,
    projectLabel: 'type',
    sequenceLabel: 'partie',
    sequenceCounted: 'partie(s)',
    itemCounted: 'question(s)',
    projectPlaceholder: "Nouveau type d'exercice — tapez un nom puis Entrée",
    createPlaceholder: 'Nouvelle partie — tapez un nom puis Entrée',
    searchesLines: false,
    view: defineAsyncComponent(() => import('@/views/DrillView.vue'))
  }
]

export const toolById = (id: string | null | undefined): ToolDefinition | undefined =>
  tools.find((tool) => tool.id === id)

/** Outil par défaut quand la route n'en désigne aucun de connu. */
export const defaultTool = tools[0]
