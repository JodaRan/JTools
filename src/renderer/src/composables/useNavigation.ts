import { useRouter } from 'vue-router'
import { useTabsStore } from '@/stores/tabs'
import { explorerRoute, routeForTab } from '@/lib/navigation'
import type { TabState } from '@shared/models'

/**
 * Les déplacements passent par le routeur ; la synchronisation des onglets se
 * fait ensuite toute seule (voir `installNavigationSync`).
 */
export function useNavigation(): {
  goToTab: (tab: TabState) => Promise<void>
  goToExplorer: () => Promise<void>
  openSequence: (toolId: string, projectId: string, sequenceId: string) => Promise<void>
} {
  const router = useRouter()
  const tabs = useTabsStore()

  const goToTab = async (tab: TabState): Promise<void> => {
    await router.push(routeForTab(tab))
  }

  const goToExplorer = async (): Promise<void> => {
    tabs.activate(null)
    await router.push(explorerRoute())
  }

  const openSequence = async (
    toolId: string,
    projectId: string,
    sequenceId: string
  ): Promise<void> => {
    await router.push({ name: 'final', params: { toolId, projectId, sequenceId } })
  }

  return { goToTab, goToExplorer, openSequence }
}
