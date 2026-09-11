<script setup lang="ts">
/**
 * Corps de l'application : fil d'Ariane, volets de contenu, panneau latéral.
 *
 * Ce composant vit sous les fournisseurs Naive UI — c'est indispensable pour
 * que les raccourcis puissent afficher des messages (`useMessage`).
 *
 * Le volet principal est piloté par le routeur. Le volet droit, lui, est un
 * pur état d'interface : il rend directement la vue finale de l'onglet choisi,
 * sans toucher à la route. C'est ce qui permet d'afficher deux séquences côte
 * à côte alors qu'une URL n'en désigne qu'une.
 */
import { computed, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import { useUiStore } from '@/stores/ui'
import { useUndoStore } from '@/stores/undo'
import { useTabsStore } from '@/stores/tabs'
import { useAppHotkeys } from '@/composables/useAppHotkeys'
import { useIdleLock } from '@/composables/useIdleLock'
import { useUndoRedo } from '@/composables/useUndoRedo'
import Breadcrumb from '@/components/shell/Breadcrumb.vue'
import CommandPalette from '@/components/shell/CommandPalette.vue'
import RightSidebar from '@/components/shell/RightSidebar.vue'
import ToolHost from '@/views/ToolHost.vue'
import IconUndo from '~icons/lucide/undo-2'
import IconRedo from '~icons/lucide/redo-2'
import IconPanel from '~icons/lucide/panel-right'
import IconClose from '~icons/lucide/x'

const ui = useUiStore()
const data = useDataStore()
const undo = useUndoStore()
const tabs = useTabsStore()
const { performUndo, performRedo } = useUndoRedo()

useAppHotkeys()
useIdleLock()

const split = computed(() => tabs.splitTab)

/**
 * La vue finale affiche déjà le nom de la séquence : l'en-tête du volet porte
 * donc le projet, seul repère qui manquerait pour savoir d'où sort ce contenu.
 */
const splitProject = computed(() =>
  split.value ? (data.project(split.value.projectId)?.name ?? 'Projet') : ''
)

// — Séparateur déplaçable —
const panes = ref<HTMLElement | null>(null)

/**
 * On suit le pointeur plutôt que d'écouter la fenêtre : la capture garantit
 * qu'un déplacement rapide qui sort du séparateur reste pris en compte.
 */
function onDividerDown(event: PointerEvent): void {
  const target = event.target as HTMLElement
  target.setPointerCapture(event.pointerId)

  const move = (e: PointerEvent): void => {
    const box = panes.value?.getBoundingClientRect()
    if (!box || box.width === 0) return
    ui.setSplitRatio((e.clientX - box.left) / box.width)
  }
  const up = (): void => {
    target.removeEventListener('pointermove', move)
    target.removeEventListener('pointerup', up)
  }
  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', up)
}
</script>

<template>
  <div class="flex min-h-0 flex-1">
    <div class="flex min-w-0 flex-1 flex-col">
      <div class="flex h-9 shrink-0 items-center gap-2 border-b border-app-border px-3">
        <Breadcrumb />

        <div class="ml-auto flex shrink-0 items-center gap-0.5">
          <button
            class="rounded p-1.5 transition-colors disabled:opacity-30"
            :class="undo.canUndo && 'hover:bg-app-surface-2 hover:text-app-text'"
            :disabled="!undo.canUndo"
            :title="undo.canUndo ? `Annuler — ${undo.nextUndoLabel}` : 'Rien à annuler'"
            data-test="undo"
            @click="performUndo()"
          >
            <IconUndo class="size-4 text-app-muted" />
          </button>
          <button
            class="rounded p-1.5 transition-colors disabled:opacity-30"
            :class="undo.canRedo && 'hover:bg-app-surface-2 hover:text-app-text'"
            :disabled="!undo.canRedo"
            :title="undo.canRedo ? `Rétablir — ${undo.nextRedoLabel}` : 'Rien à rétablir'"
            data-test="redo"
            @click="performRedo()"
          >
            <IconRedo class="size-4 text-app-muted" />
          </button>
          <button
            class="rounded p-1.5 transition-colors hover:bg-app-surface-2"
            :class="ui.sidebar.open ? 'text-app-accent' : 'text-app-muted'"
            title="Panneau latéral (Ctrl+B)"
            data-test="sidebar-toggle"
            @click="ui.toggleSidebar()"
          >
            <IconPanel class="size-4" />
          </button>
        </div>
      </div>

      <div ref="panes" class="flex min-h-0 flex-1">
        <main
          class="min-h-0 min-w-0 overflow-auto px-6 py-6"
          :style="split ? { flex: `0 0 ${ui.split.ratio * 100}%` } : { flex: '1 1 0%' }"
        >
          <RouterView />
        </main>

        <template v-if="split">
          <div
            class="w-1 shrink-0 cursor-col-resize bg-app-border transition-colors hover:bg-app-accent"
            title="Glisser pour redimensionner"
            data-test="split-divider"
            @pointerdown="onDividerDown"
          ></div>

          <section class="flex min-h-0 min-w-0 flex-1 flex-col" data-test="split-pane">
            <div
              class="flex h-8 shrink-0 items-center gap-2 border-b border-app-border bg-app-surface px-3"
            >
              <span class="min-w-0 truncate text-[12px] text-app-muted">
                {{ splitProject }}
              </span>
              <button
                class="ml-auto shrink-0 rounded p-1 text-app-muted transition-colors hover:bg-app-surface-2 hover:text-app-text"
                title="Fermer le volet de droite"
                data-test="split-close"
                @click="tabs.closeSplit()"
              >
                <IconClose class="size-3.5" />
              </button>
            </div>

            <div class="min-h-0 flex-1 overflow-auto px-6 py-6">
              <ToolHost
                :key="split.sequenceId"
                :tool-id="split.toolId"
                :project-id="split.projectId"
                :sequence-id="split.sequenceId"
                embedded
              />
            </div>
          </section>
        </template>
      </div>
    </div>

    <RightSidebar />
    <CommandPalette />
  </div>
</template>
