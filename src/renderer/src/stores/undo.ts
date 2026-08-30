import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { useHistoryStore } from '@/stores/history'
import { useDataStore } from '@/stores/data'
import type { Command, CommandFocus } from '@/lib/commands'

/** Au-delà, la pile ne rend plus service et retient de la mémoire pour rien. */
const MAX_DEPTH = 200

/**
 * Pile d'annulation unique pour toute l'application : annuler la suppression
 * d'un projet doit marcher depuis n'importe quel onglet. Elle vit en mémoire —
 * c'est le journal (`stores/history`) qui, lui, survit au redémarrage.
 */
export const useUndoStore = defineStore('undo', () => {
  const past = shallowRef<Command[]>([])
  const future = shallowRef<Command[]>([])

  /** Dernier endroit touché : le shell s'en sert pour y ramener l'utilisateur. */
  const lastFocus = ref<CommandFocus | null>(null)
  const lastLabel = ref<string | null>(null)

  const canUndo = computed(() => past.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)
  const nextUndoLabel = computed(() => past.value.at(-1)?.label ?? null)
  const nextRedoLabel = computed(() => future.value.at(-1)?.label ?? null)

  /** Fenêtre pendant laquelle deux commandes de même clé fusionnent. */
  const COALESCE_MS = 1500
  let lastRunAt = 0

  /**
   * Traduit une commande en entrée de journal. Les charges utiles d'une ligne
   * masquée sont écartées : le libellé est déjà expurgé côté commandes, mais
   * `before`/`after` transportaient encore la valeur en clair jusque dans
   * history.json.
   */
  const asEntry = (
    command: Command
  ): Parameters<ReturnType<typeof useHistoryStore>['append']>[0] => {
    const data = useDataStore()
    const secret =
      command.entityType === 'line' && data.line(command.entityId)?.masked === true

    return {
      action: command.action,
      entityType: command.entityType,
      entityId: command.entityId,
      sequenceId: command.sequenceId,
      label: command.label,
      before: secret ? null : (command.before ?? null),
      after: secret ? null : (command.after ?? null)
    }
  }

  /** Exécute une commande et la rend annulable. Toute mutation passe par ici. */
  function run(command: Command): void {
    const history = useHistoryStore()
    const previous = past.value.at(-1)
    const merges =
      command.coalesceKey !== undefined &&
      previous?.coalesceKey === command.coalesceKey &&
      Date.now() - lastRunAt < COALESCE_MS

    command.do()

    if (merges && previous) {
      // On conserve le `undo` d'origine : il ramène avant le début de la rafale.
      const merged: Command = {
        ...previous,
        label: command.label,
        after: command.after,
        do: command.do
      }
      past.value = [...past.value.slice(0, -1), merged]
      history.replaceLast(asEntry(merged))
    } else {
      past.value = [...past.value, command].slice(-MAX_DEPTH)
      history.append(asEntry(command))
    }

    // Une nouvelle action coupe la branche de rétablissement, comme partout.
    future.value = []
    lastFocus.value = command.focus ?? null
    lastLabel.value = command.label
    lastRunAt = Date.now()
  }

  function undo(): Command | null {
    const command = past.value.at(-1)
    if (!command) return null
    command.undo()
    past.value = past.value.slice(0, -1)
    future.value = [...future.value, command]
    lastRunAt = 0
    lastFocus.value = command.focus ?? null
    lastLabel.value = command.label
    return command
  }

  function redo(): Command | null {
    const command = future.value.at(-1)
    if (!command) return null
    command.do()
    future.value = future.value.slice(0, -1)
    past.value = [...past.value, command]
    lastRunAt = 0
    lastFocus.value = command.focus ?? null
    lastLabel.value = command.label
    return command
  }

  /** Après un import, les commandes d'avant ne décrivent plus l'état courant. */
  function reset(): void {
    past.value = []
    future.value = []
    lastRunAt = 0
    lastFocus.value = null
    lastLabel.value = null
  }

  return {
    past,
    future,
    canUndo,
    canRedo,
    nextUndoLabel,
    nextRedoLabel,
    lastFocus,
    lastLabel,
    run,
    undo,
    redo,
    reset
  }
})
