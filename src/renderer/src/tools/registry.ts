import { defineAsyncComponent, type Component } from 'vue'
import IconTerminal from '~icons/lucide/terminal'
import IconKanban from '~icons/lucide/square-kanban'

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
  /** Invite du champ de création, dans la liste des séquences. */
  createPlaceholder: string
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
    createPlaceholder: 'Nouvelle séquence — tapez un nom puis Entrée',
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
    createPlaceholder: 'Nouveau tableau — tapez un nom puis Entrée',
    view: defineAsyncComponent(() => import('@/views/BoardView.vue'))
  }
]

export const toolById = (id: string | null | undefined): ToolDefinition | undefined =>
  tools.find((tool) => tool.id === id)

/** Outil par défaut quand la route n'en désigne aucun de connu. */
export const defaultTool = tools[0]
