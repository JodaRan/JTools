import type { Component } from 'vue'
import IconTerminal from '~icons/lucide/terminal'

/**
 * Catalogue des outils. Ce n'est pas de la donnée : un outil est du code, et
 * en ajouter un se fait ici. Chaque outil apporte sa propre « vue finale »,
 * celle qu'on ouvre dans un onglet.
 */
export interface ToolDefinition {
  id: string
  name: string
  description: string
  icon: Component
  /** Libellés du niveau intermédiaire, pour rester juste selon l'outil. */
  projectLabel: string
  sequenceLabel: string
}

export const tools: ToolDefinition[] = [
  {
    id: 'sequences',
    name: 'Séquences',
    description: 'Listes de commandes à copier-coller, par projet.',
    icon: IconTerminal,
    projectLabel: 'projet',
    sequenceLabel: 'séquence'
  }
]

export const toolById = (id: string | null | undefined): ToolDefinition | undefined =>
  tools.find((tool) => tool.id === id)
