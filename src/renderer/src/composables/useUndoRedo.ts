import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { useUndoStore } from '@/stores/undo'
import { useDataStore } from '@/stores/data'
import { useSpotlight } from '@/composables/useSpotlight'
import type { CommandFocus } from '@/lib/commands'

/**
 * Annulation globale : une seule pile pour toute l'app, et une navigation
 * automatique vers l'endroit touché. Annuler quelque chose qu'on ne voit pas
 * serait pire que ne rien annuler du tout.
 */
export function useUndoRedo(): { performUndo: () => Promise<void>; performRedo: () => Promise<void> } {
  const undo = useUndoStore()
  const data = useDataStore()
  const router = useRouter()
  const message = useMessage()
  const { spot } = useSpotlight()

  async function reveal(focus: CommandFocus | undefined): Promise<void> {
    if (!focus) return

    // On ne navigue que vers ce qui existe encore après l'opération.

    // Une ligne ne se juge que dans sa vue finale : on y entre, qu'elle vienne
    // de réapparaître ou de repartir. Le halo, lui, suppose qu'elle existe.
    if (focus.lineId && focus.sequenceId && data.sequence(focus.sequenceId)) {
      await router.push({
        name: 'final',
        params: {
          toolId: focus.toolId,
          projectId: focus.projectId,
          sequenceId: focus.sequenceId
        }
      })
      if (data.line(focus.lineId)) await spot(focus.lineId)
      return
    }

    // Pour une séquence entière, on s'arrête à la liste qui la contient :
    // elle s'y voit revenir, et aucun onglet n'apparaît sans qu'on l'ait voulu.

    if (focus.projectId && data.project(focus.projectId)) {
      await router.push({
        name: 'sequences',
        params: { toolId: focus.toolId, projectId: focus.projectId }
      })
      return
    }

    await router.push({ name: 'projects', params: { toolId: focus.toolId } })
  }

  async function performUndo(): Promise<void> {
    const command = undo.undo()
    if (!command) {
      message.info('Rien à annuler.')
      return
    }
    await reveal(command.focus)
    message.info(`Annulé — ${command.label}`)
  }

  async function performRedo(): Promise<void> {
    const command = undo.redo()
    if (!command) {
      message.info('Rien à rétablir.')
      return
    }
    await reveal(command.focus)
    message.info(`Rétabli — ${command.label}`)
  }

  return { performUndo, performRedo }
}
