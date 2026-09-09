import { useMessage } from 'naive-ui'
import { useUndoStore } from '@/stores/undo'
import { parseLegacyBoard, planImport, type LegacySource } from '@/lib/legacy'
import { importLegacyBoards, type ImportOutcome } from '@/lib/task-commands'

/**
 * Reprise des sauvegardes de l'ancien gestionnaire de tâches, depuis
 * l'interface. Un dossier entier ou un fichier isolé aboutissent au même
 * endroit : une commande unique, donc un seul Ctrl+Z pour tout défaire.
 */
export function useLegacyImport(): {
  importLegacy: (
    mode: 'file' | 'folder',
    toolId: string,
    projectId?: string
  ) => Promise<ImportOutcome | null>
} {
  const undo = useUndoStore()
  const message = useMessage()

  async function importLegacy(
    mode: 'file' | 'folder',
    toolId: string,
    projectId?: string
  ): Promise<ImportOutcome | null> {
    const picked = await window.jtools.legacy.pick(mode)
    if (picked === null) return null

    const sources: LegacySource[] = []
    for (const entry of picked) {
      const legacy = parseLegacyBoard(entry.data)
      if (legacy) sources.push({ name: entry.name, legacy })
    }

    if (sources.length === 0) {
      message.error("Aucune sauvegarde exploitable ici — il faut un fichier avec des « tasks ».")
      return null
    }

    const plans = planImport(sources)
    const command = importLegacyBoards(toolId, plans, projectId)
    undo.run(command)

    const { boards, tasks, projects } = command.outcome
    const parts = [
      projects > 0 ? `${projects} projet(s)` : null,
      `${boards} tableau(x)`,
      `${tasks} tâche(s)`
    ].filter(Boolean)
    message.success(`Repris : ${parts.join(', ')}.`)
    return command.outcome
  }

  return { importLegacy }
}
