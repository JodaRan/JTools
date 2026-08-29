import { computed, ref, watchEffect } from 'vue'
import { defineStore } from 'pinia'
import { registerSource, scheduleSave } from '@/lib/persist'
import {
  SCHEMA_VERSION,
  defaultUi,
  type SidebarPanel,
  type TabState,
  type ThemeMode,
  type UiFile,
  type WindowState
} from '@shared/models'

/**
 * L'« état » de l'application, par opposition à la donnée métier : géométrie
 * de la fenêtre, thème, onglets ouverts, sidebar. C'est ce fichier qui permet
 * de retrouver l'app exactement comme on l'a laissée.
 */
export const useUiStore = defineStore('ui', () => {
  const initial = defaultUi()

  const themeMode = ref<ThemeMode>(initial.theme)
  const systemPrefersDark = ref(false)
  const windowState = ref<WindowState>({ ...initial.window })
  const tabs = ref<TabState[]>([])
  const activeTabId = ref<string | null>(null)
  const explorer = ref({ ...initial.explorer })
  const sidebar = ref({ ...initial.sidebar })

  const isDark = computed(() =>
    themeMode.value === 'system' ? systemPrefersDark.value : themeMode.value === 'dark'
  )

  function setThemeMode(mode: ThemeMode): void {
    themeMode.value = mode
    window.jtools.theme.setSource(mode)
    touch()
  }

  /** Bascule clair ↔ sombre en sortant du mode « système ». */
  function toggleTheme(): void {
    setThemeMode(isDark.value ? 'light' : 'dark')
  }

  function setSidebar(open: boolean, panel?: SidebarPanel): void {
    sidebar.value.open = open
    if (panel) sidebar.value.panel = panel
    touch()
  }

  function toggleSidebar(panel?: SidebarPanel): void {
    // Cliquer sur un autre panneau alors que la sidebar est ouverte bascule
    // le contenu au lieu de refermer.
    if (sidebar.value.open && panel && panel !== sidebar.value.panel) {
      sidebar.value.panel = panel
      touch()
      return
    }
    setSidebar(!sidebar.value.open, panel)
  }

  function setExplorer(toolId: string | null, projectId: string | null): void {
    explorer.value = { toolId, projectId }
    touch()
  }

  function serialize(): UiFile {
    return {
      version: SCHEMA_VERSION,
      window: windowState.value,
      theme: themeMode.value,
      tabs: tabs.value,
      activeTabId: activeTabId.value,
      explorer: explorer.value,
      sidebar: sidebar.value
    }
  }

  function touch(): void {
    scheduleSave('ui')
  }

  function hydrate(file: UiFile | undefined): void {
    const source = { ...defaultUi(), ...(file ?? {}) }
    themeMode.value = source.theme
    windowState.value = { ...defaultUi().window, ...source.window }
    tabs.value = source.tabs ?? []
    activeTabId.value = source.activeTabId ?? null
    explorer.value = { ...defaultUi().explorer, ...source.explorer }
    sidebar.value = { ...defaultUi().sidebar, ...source.sidebar }
  }

  async function init(): Promise<void> {
    systemPrefersDark.value = await window.jtools.theme.shouldUseDark()
    window.jtools.theme.onChange((dark) => {
      systemPrefersDark.value = dark
    })
    window.jtools.theme.setSource(themeMode.value)

    // La géométrie est mesurée côté principal ; on ne fait que l'enregistrer.
    window.jtools.window.onStateChange((state) => {
      windowState.value = state
      touch()
    })

    // Le thème s'applique à <html> pour que la variante `dark:` de Tailwind
    // et les variables CSS suivent Naive UI.
    watchEffect(() => {
      document.documentElement.classList.toggle('dark', isDark.value)
    })
  }

  registerSource('ui', serialize)

  return {
    themeMode,
    isDark,
    windowState,
    tabs,
    activeTabId,
    explorer,
    sidebar,
    setThemeMode,
    toggleTheme,
    setSidebar,
    toggleSidebar,
    setExplorer,
    serialize,
    hydrate,
    touch,
    init
  }
})
