import { onBeforeUnmount, onMounted } from 'vue'
import { useTabsStore } from '@/stores/tabs'
import { useNavigation } from '@/composables/useNavigation'
import { useUndoRedo } from '@/composables/useUndoRedo'
import { useUiStore } from '@/stores/ui'
import { registerHotkeys } from '@/lib/hotkeys'
import { routeForTab } from '@/lib/navigation'
import { useRouter } from 'vue-router'

/** Raccourcis globaux de la coquille : annulation, onglets, navigation. */
export function useAppHotkeys(): void {
  const tabs = useTabsStore()
  const ui = useUiStore()
  const router = useRouter()
  const { goToExplorer } = useNavigation()
  const { performUndo, performRedo } = useUndoRedo()

  const goTo = (tabId: string | null): void => {
    if (tabId === null) {
      void goToExplorer()
      return
    }
    const tab = tabs.tabs.find((item) => item.id === tabId)
    if (tab) void router.push(routeForTab(tab))
  }

  let dispose: (() => void) | undefined

  onMounted(() => {
    dispose = registerHotkeys([
      // Annulation active jusque dans les champs : la frappe étant regroupée
      // en une seule entrée, Ctrl+Z y fait ce que l'utilisateur attend.
      { key: 'z', ctrl: true, inFields: true, run: () => void performUndo() },
      { key: 'y', ctrl: true, inFields: true, run: () => void performRedo() },
      { key: 'z', ctrl: true, shift: true, inFields: true, run: () => void performRedo() },
      { key: 'b', ctrl: true, inFields: true, run: () => ui.toggleSidebar() },
      // Ctrl+W ferme l'onglet courant ; sur l'Explorer, il ne fait rien.
      {
        key: 'w',
        ctrl: true,
        inFields: true,
        run: () => {
          const current = tabs.activeId
          if (!current) return
          const next = tabs.close(current)
          goTo(next?.id ?? null)
        }
      },
      { key: 'Tab', ctrl: true, inFields: true, run: () => goTo(tabs.cycle(1)) },
      { key: 'Tab', ctrl: true, shift: true, inFields: true, run: () => goTo(tabs.cycle(-1)) },
      // Ctrl+1..9 : le 1 est l'Explorer, les suivants sont les onglets.
      ...Array.from({ length: 9 }, (_, index) => ({
        key: String(index + 1),
        ctrl: true,
        inFields: true,
        run: (): void => {
          if (index === 0) return goTo(null)
          const tab = tabs.tabs[index - 1]
          if (tab) goTo(tab.id)
        }
      }))
    ])
  })

  onBeforeUnmount(() => dispose?.())
}
