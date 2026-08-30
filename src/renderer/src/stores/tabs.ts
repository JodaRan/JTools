import { computed } from 'vue'
import { defineStore } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useDataStore } from '@/stores/data'
import { newId } from '@/lib/id'
import type { TabState } from '@shared/models'

/**
 * Onglets à la Notepad : un onglet par vue finale, tous projets confondus,
 * fermés uniquement à la demande. L'état vit dans le store `ui` (c'est lui qui
 * sérialise ui.json) ; ce store n'en est que la logique.
 *
 * `activeTabId === null` désigne la pastille Explorer, permanente et non
 * fermable, d'où l'on parcourt Outils › Projets › Séquences.
 */
export const useTabsStore = defineStore('tabs', () => {
  const ui = useUiStore()
  const data = useDataStore()

  const tabs = computed(() => ui.tabs)
  const activeId = computed(() => ui.activeTabId)
  const active = computed(() => ui.tabs.find((tab) => tab.id === ui.activeTabId) ?? null)

  /** L'onglet affiché dans le volet droit, s'il existe encore. */
  const splitTab = computed(
    () => ui.tabs.find((tab) => tab.id === ui.split.tabId) ?? null
  )

  /** Le titre suit le nom de la séquence : renommer met l'onglet à jour. */
  const titleOf = (tab: TabState): string => data.sequence(tab.sequenceId)?.name ?? 'Séquence'

  const findBySequence = (sequenceId: string): TabState | undefined =>
    ui.tabs.find((tab) => tab.sequenceId === sequenceId)

  /** Ouvre la séquence, ou revient sur son onglet s'il est déjà là. */
  function open(toolId: string, projectId: string, sequenceId: string): TabState {
    const existing = findBySequence(sequenceId)
    if (existing) {
      activate(existing.id)
      return existing
    }
    const tab: TabState = { id: newId(), toolId, projectId, sequenceId }
    ui.tabs = [...ui.tabs, tab]
    activate(tab.id)
    return tab
  }

  function activate(tabId: string | null): void {
    ui.activeTabId = tabId
    // Les deux volets ne montrent jamais la même séquence : ce serait deux
    // vues concurrentes du même contenu, avec un halo d'annulation ambigu.
    if (tabId !== null && ui.split.tabId === tabId) ui.split.tabId = null
    ui.touch()
  }

  /**
   * Envoie un onglet dans le volet droit. S'il occupait le volet principal,
   * celui-ci retombe sur le voisin, puis sur l'Explorer : le contenu ne peut
   * pas être des deux côtés.
   */
  function openSplit(tabId: string): string | null {
    if (!ui.tabs.some((tab) => tab.id === tabId)) return ui.activeTabId
    ui.split.tabId = tabId
    if (ui.activeTabId === tabId) {
      const others = ui.tabs.filter((tab) => tab.id !== tabId)
      ui.activeTabId = others[0]?.id ?? null
    }
    ui.touch()
    return ui.activeTabId
  }

  function closeSplit(): void {
    ui.split.tabId = null
    ui.touch()
  }

  /**
   * Ferme un onglet et rend la main au voisin de droite — c'est celui que
   * l'œil attend — puis à celui de gauche, puis à l'Explorer.
   */
  function close(tabId: string): TabState | null {
    const index = ui.tabs.findIndex((tab) => tab.id === tabId)
    if (index === -1) return null
    const remaining = ui.tabs.filter((tab) => tab.id !== tabId)
    ui.tabs = remaining
    if (ui.split.tabId === tabId) ui.split.tabId = null
    if (ui.activeTabId === tabId) {
      ui.activeTabId = (remaining[index] ?? remaining[index - 1] ?? null)?.id ?? null
    }
    ui.touch()
    return remaining[index] ?? remaining[index - 1] ?? null
  }

  function closeOthers(tabId: string): void {
    ui.tabs = ui.tabs.filter((tab) => tab.id === tabId)
    ui.activeTabId = tabId
    ui.split.tabId = null
    ui.touch()
  }

  function closeAll(): void {
    ui.tabs = []
    ui.activeTabId = null
    ui.split.tabId = null
    ui.touch()
  }

  function reorder(ids: string[]): void {
    const byId = new Map(ui.tabs.map((tab) => [tab.id, tab]))
    ui.tabs = ids.map((id) => byId.get(id)).filter((tab): tab is TabState => tab !== undefined)
    ui.touch()
  }

  /** Ctrl+Tab / Ctrl+Maj+Tab : l'Explorer fait partie du cycle. */
  function cycle(direction: 1 | -1): string | null {
    const ring: (string | null)[] = [null, ...ui.tabs.map((tab) => tab.id)]
    if (ring.length < 2) return ui.activeTabId
    const current = ring.indexOf(ui.activeTabId)
    const next = ring[(current + direction + ring.length) % ring.length]
    activate(next)
    return next
  }

  /** Un onglet dont la séquence a disparu (suppression, import) n'a plus lieu d'être. */
  function prune(): void {
    const alive = ui.tabs.filter((tab) => data.sequence(tab.sequenceId) !== undefined)
    if (alive.length === ui.tabs.length) return
    ui.tabs = alive
    if (!alive.some((tab) => tab.id === ui.activeTabId)) ui.activeTabId = null
    if (!alive.some((tab) => tab.id === ui.split.tabId)) ui.split.tabId = null
    ui.touch()
  }

  return {
    tabs,
    activeId,
    active,
    splitTab,
    titleOf,
    findBySequence,
    open,
    activate,
    openSplit,
    closeSplit,
    close,
    closeOthers,
    closeAll,
    reorder,
    cycle,
    prune
  }
})
