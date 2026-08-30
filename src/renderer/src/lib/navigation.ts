import type { RouteLocationNormalizedLoaded, RouteLocationRaw, Router } from 'vue-router'
import { useUiStore } from '@/stores/ui'
import { useDataStore } from '@/stores/data'
import { useTabsStore } from '@/stores/tabs'
import type { TabState } from '@shared/models'

export const routeForTab = (tab: TabState): RouteLocationRaw => ({
  name: 'final',
  params: { toolId: tab.toolId, projectId: tab.projectId, sequenceId: tab.sequenceId }
})

/**
 * Le cran au-dessus dans la hiérarchie Outils › Projet › Séquence.
 * `null` sur la racine : il n'y a nulle part où remonter.
 */
export function parentRoute(route: RouteLocationNormalizedLoaded): RouteLocationRaw | null {
  const { toolId, projectId } = route.params as Record<string, string | undefined>

  if (route.name === 'final' && toolId && projectId) {
    return { name: 'sequences', params: { toolId, projectId } }
  }
  if (route.name === 'sequences' && toolId) return { name: 'projects', params: { toolId } }
  if (route.name === 'projects') return { name: 'tools' }
  return null
}

/** Où l'Explorer doit reprendre : le dernier niveau visité, s'il existe encore. */
export function explorerRoute(): RouteLocationRaw {
  const ui = useUiStore()
  const data = useDataStore()
  const { toolId, projectId } = ui.explorer

  if (toolId && projectId && data.project(projectId)) {
    return { name: 'sequences', params: { toolId, projectId } }
  }
  if (toolId) return { name: 'projects', params: { toolId } }
  return { name: 'tools' }
}

/**
 * Fait de la route la source de vérité pour les onglets : peu importe comment
 * on arrive sur une vue finale (clic dans la liste, fil d'Ariane, annulation,
 * restauration de session), l'onglet correspondant s'ouvre ou reprend la main.
 */
export function installNavigationSync(router: Router): void {
  router.afterEach((to) => {
    const tabs = useTabsStore()
    const ui = useUiStore()

    if (to.name === 'final') {
      const { toolId, projectId, sequenceId } = to.params as Record<string, string>
      tabs.open(toolId, projectId, sequenceId)
      return
    }

    // Toute autre route, c'est l'Explorer — dont on retient l'emplacement.
    tabs.activate(null)
    ui.setExplorer(
      (to.params.toolId as string | undefined) ?? null,
      (to.params.projectId as string | undefined) ?? null
    )
  })
}

/**
 * Rouvre l'app là où on l'a quittée : l'onglet actif d'abord, sinon le dernier
 * emplacement de l'Explorer. Les cibles disparues retombent en douceur.
 */
export function initialRoute(): RouteLocationRaw {
  const ui = useUiStore()
  const data = useDataStore()

  const tab = ui.tabs.find((item) => item.id === ui.activeTabId)
  if (tab && data.sequence(tab.sequenceId)) return routeForTab(tab)

  return explorerRoute()
}
