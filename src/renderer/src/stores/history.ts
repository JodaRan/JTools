import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { registerSource, scheduleSave } from '@/lib/persist'
import { newId, now } from '@/lib/id'
import {
  SCHEMA_VERSION,
  defaultHistory,
  type HistoryEntry,
  type HistoryFile
} from '@shared/models'

/** Au-delà, le journal ne sert plus à rien et alourdit le fichier. */
const MAX_ENTRIES = 1000

/**
 * Journal persistant des modifications, distinct de la pile d'annulation :
 * il survit au redémarrage et alimente le panneau latéral « Historique ».
 */
export const useHistoryStore = defineStore('history', () => {
  const entries = ref<HistoryEntry[]>([])

  const recent = computed(() => [...entries.value].reverse())

  const forSequence = (sequenceId: string): HistoryEntry[] =>
    recent.value.filter((e) => e.sequenceId === sequenceId)

  function append(entry: Omit<HistoryEntry, 'id' | 'at'>): void {
    entries.value.push({ ...entry, id: newId(), at: now() })
    if (entries.value.length > MAX_ENTRIES) {
      entries.value = entries.value.slice(-MAX_ENTRIES)
    }
    scheduleSave('history')
  }

  /** Utilisé quand une rafale de frappe fusionne : une seule trace, à jour. */
  function replaceLast(entry: Omit<HistoryEntry, 'id' | 'at'>): void {
    const last = entries.value.at(-1)
    if (!last) return append(entry)
    entries.value = [...entries.value.slice(0, -1), { ...last, ...entry, at: now() }]
    scheduleSave('history')
  }

  function clear(): void {
    entries.value = []
    scheduleSave('history')
  }

  function serialize(): HistoryFile {
    return { version: SCHEMA_VERSION, entries: entries.value }
  }

  function hydrate(file: HistoryFile | undefined): void {
    entries.value = (file ?? defaultHistory()).entries ?? []
  }

  registerSource('history', serialize)

  return { entries, recent, forSequence, append, replaceLast, clear, serialize, hydrate }
})
