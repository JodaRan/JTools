<script setup lang="ts">
/**
 * Corps de l'application : fil d'Ariane, contenu, panneau latéral.
 *
 * Ce composant vit sous les fournisseurs Naive UI — c'est indispensable pour
 * que les raccourcis puissent afficher des messages (`useMessage`).
 */
import { useUiStore } from '@/stores/ui'
import { useUndoStore } from '@/stores/undo'
import { useAppHotkeys } from '@/composables/useAppHotkeys'
import { useUndoRedo } from '@/composables/useUndoRedo'
import Breadcrumb from '@/components/shell/Breadcrumb.vue'
import RightSidebar from '@/components/shell/RightSidebar.vue'
import IconUndo from '~icons/lucide/undo-2'
import IconRedo from '~icons/lucide/redo-2'
import IconPanel from '~icons/lucide/panel-right'

const ui = useUiStore()
const undo = useUndoStore()
const { performUndo, performRedo } = useUndoRedo()

useAppHotkeys()
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

      <main class="min-h-0 flex-1 overflow-auto px-6 py-6">
        <RouterView />
      </main>
    </div>

    <RightSidebar />
  </div>
</template>
