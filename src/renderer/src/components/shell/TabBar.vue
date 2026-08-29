<script setup lang="ts">
/**
 * Barre d'onglets logée dans la barre de titre. Un onglet ne se ferme qu'au
 * clic sur son ×, au clic milieu ou par Ctrl+W ; il se déplace au glisser.
 *
 * La pastille Explorer, en tête, est permanente : c'est de là qu'on parcourt
 * Outils › Projets › Séquences.
 */
import { computed, nextTick, ref } from 'vue'
import { NDropdown } from 'naive-ui'
import { VueDraggable } from 'vue-draggable-plus'
import { useTabsStore } from '@/stores/tabs'
import { useNavigation } from '@/composables/useNavigation'
import type { TabState } from '@shared/models'
import IconFolder from '~icons/lucide/folder-tree'
import IconClose from '~icons/lucide/x'

const tabs = useTabsStore()
const { goToTab, goToExplorer } = useNavigation()

// Sortable réordonne le tableau qu'on lui confie : on renvoie l'ordre au store.
const ordered = computed({
  get: () => tabs.tabs,
  set: (value: TabState[]) => tabs.reorder(value.map((tab) => tab.id))
})

function closeTab(tab: TabState): void {
  const wasActive = tabs.activeId === tab.id
  const next = tabs.close(tab.id)
  if (!wasActive) return
  if (next) void goToTab(next)
  else void goToExplorer()
}

/** Le clic milieu ferme, comme dans un navigateur. */
function onAuxClick(event: MouseEvent, tab: TabState): void {
  if (event.button !== 1) return
  event.preventDefault()
  closeTab(tab)
}

// — Menu contextuel : Naive UI le pilote à la position du curseur —
const menuShow = ref(false)
const menuX = ref(0)
const menuY = ref(0)
const menuTab = ref<TabState | null>(null)

const menuOptions = [
  { key: 'close', label: 'Fermer' },
  { key: 'others', label: 'Fermer les autres' },
  { key: 'all', label: 'Tout fermer' }
]

async function onContextMenu(event: MouseEvent, tab: TabState): Promise<void> {
  event.preventDefault()
  menuTab.value = tab
  // Refermer puis rouvrir force Naive à recalculer la position.
  menuShow.value = false
  await nextTick()
  menuX.value = event.clientX
  menuY.value = event.clientY
  menuShow.value = true
}

function onMenuSelect(key: string): void {
  const tab = menuTab.value
  menuShow.value = false
  if (!tab) return
  if (key === 'close') closeTab(tab)
  if (key === 'others') {
    tabs.closeOthers(tab.id)
    void goToTab(tab)
  }
  if (key === 'all') {
    tabs.closeAll()
    void goToExplorer()
  }
}
</script>

<template>
  <div class="app-no-drag flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto pr-2">
    <button
      class="flex h-8 shrink-0 items-center gap-1.5 rounded-t-md px-3 text-[13px] transition-colors"
      :class="
        tabs.activeId === null
          ? 'bg-app-bg text-app-text'
          : 'text-app-muted hover:bg-app-surface-2 hover:text-app-text'
      "
      title="Explorer les outils et les projets"
      data-test="tab-explorer"
      @click="goToExplorer()"
    >
      <IconFolder class="size-4" />
    </button>

    <VueDraggable
      v-model="ordered"
      :animation="150"
      ghost-class="opacity-40"
      class="flex min-w-0 items-end gap-0.5"
    >
      <div
        v-for="tab in ordered"
        :key="tab.id"
        class="group/tab flex h-8 max-w-[200px] shrink-0 items-center gap-1 rounded-t-md pr-1 pl-3 text-[13px] transition-colors"
        :class="
          tabs.activeId === tab.id
            ? 'bg-app-bg text-app-text'
            : 'text-app-muted hover:bg-app-surface-2 hover:text-app-text'
        "
        @auxclick="onAuxClick($event, tab)"
        @contextmenu="onContextMenu($event, tab)"
      >
        <button
          class="min-w-0 truncate py-1"
          :title="tabs.titleOf(tab)"
          :data-test-tab="tabs.titleOf(tab)"
          @click="goToTab(tab)"
        >
          {{ tabs.titleOf(tab) }}
        </button>

        <button
          class="shrink-0 rounded p-0.5 text-app-muted opacity-0 transition-opacity group-hover/tab:opacity-100 hover:bg-app-surface-2 hover:text-app-text"
          :class="tabs.activeId === tab.id && 'opacity-100'"
          title="Fermer l'onglet"
          :data-test-tab-close="tabs.titleOf(tab)"
          @click.stop="closeTab(tab)"
        >
          <IconClose class="size-3.5" />
        </button>
      </div>
    </VueDraggable>

    <NDropdown
      trigger="manual"
      placement="bottom-start"
      :show="menuShow"
      :x="menuX"
      :y="menuY"
      :options="menuOptions"
      @select="onMenuSelect"
      @clickoutside="menuShow = false"
    />
  </div>
</template>
