import { ref, type Ref } from 'vue'
import { useUiStore } from '@/stores/ui'
import type { SidebarPanel } from '@shared/models'

/**
 * Ce que le panneau latéral affiche pour l'outil « Exercices ».
 *
 * La leçon ne vit pas dans la carte de la question : elle tiendrait la moitié
 * de l'écran alors qu'on ne la consulte qu'en cas de doute. Un clic l'envoie
 * donc à droite, là où l'historique et le guide se trouvent déjà.
 */
const lessonQuestionId = ref<string | null>(null)

export function useDrillPanel(): {
  lessonQuestionId: Ref<string | null>
  showLesson: (questionId: string) => void
  showPanel: (panel: SidebarPanel) => void
} {
  const ui = useUiStore()

  /** Ouvre le panneau demandé, en le déployant s'il était replié. */
  const showPanel = (panel: SidebarPanel): void => {
    if (ui.sidebar.open && ui.sidebar.panel === panel) ui.setSidebar(false)
    else ui.setSidebar(true, panel)
  }

  const showLesson = (questionId: string): void => {
    // Recliquer sur la même question referme : le bouton est une bascule.
    const same = lessonQuestionId.value === questionId && ui.sidebar.panel === 'lesson'
    lessonQuestionId.value = questionId
    if (same && ui.sidebar.open) ui.setSidebar(false)
    else ui.setSidebar(true, 'lesson')
  }

  return { lessonQuestionId, showLesson, showPanel }
}
