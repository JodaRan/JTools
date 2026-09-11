<script setup lang="ts">
/**
 * Vue finale de l'outil « Tâches » : un tableau kanban.
 *
 * Mêmes principes que la vue séquence — édition en place, aucune modale,
 * aucun bouton « enregistrer », tout annulable. Deux règles lui sont propres :
 * les cartes d'une colonne sont rangées par priorité, et le glisser-déposer ne
 * touche jamais à la priorité (voir `BoardColumn.vue`).
 */
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { VueDraggable } from 'vue-draggable-plus'
import { useDataStore } from '@/stores/data'
import { useUndoStore } from '@/stores/undo'
import { useSpotlight } from '@/composables/useSpotlight'
import { renameSequence } from '@/lib/commands'
import {
  createColumn,
  createTask,
  deleteColumn,
  deleteTask,
  duplicateTask,
  ensureBoard,
  moveTask,
  renameColumn,
  reorderColumns,
  reorderTasks,
  setTaskPriority,
  PRIORITY_LABELS
} from '@/lib/task-commands'
import BackButton from '@/components/common/BackButton.vue'
import SearchField from '@/components/common/SearchField.vue'
import BoardColumn from '@/components/board/BoardColumn.vue'
import TaskPeek from '@/components/board/TaskPeek.vue'
import { PRIORITIES, type Column, type Priority } from '@shared/models'
import IconPlus from '~icons/lucide/plus'

const props = defineProps<{
  toolId: string
  projectId: string
  sequenceId: string
  embedded?: boolean
}>()

const data = useDataStore()
const undo = useUndoStore()
const message = useMessage()
const { spotlightId } = useSpotlight()

const board = computed(() => data.sequence(props.sequenceId))
const tasks = computed(() => data.tasksOfBoard(props.sequenceId))

/**
 * Un tableau ouvert sans colonnes ne saurait rien montrer. Le cas arrive à la
 * marge — séquence créée par l'autre outil, sauvegarde recollée à la main — et
 * se répare une fois pour toutes, silencieusement.
 */
onMounted(() => {
  if (!board.value) return
  if (data.board(props.sequenceId) && data.columnsOfBoard(props.sequenceId).length > 0) return
  undo.run(ensureBoard(props.sequenceId))
})

// —————————————————————————— Colonnes ——————————————————————————

const columns = ref<Column[]>([])
watch(
  () => data.columnsOfBoard(props.sequenceId),
  (list) => (columns.value = [...list]),
  { immediate: true, deep: true }
)

function onColumnsMoved(): void {
  undo.run(reorderColumns(props.sequenceId, columns.value.map((column) => column.id)))
}

const newColumn = ref('')
const addingColumn = ref(false)

function commitColumn(): void {
  const name = newColumn.value.trim()
  newColumn.value = ''
  addingColumn.value = false
  if (name) undo.run(createColumn(props.sequenceId, name))
}

function removeColumn(column: Column): void {
  undo.run(deleteColumn(column.id))
  message.warning(`Colonne « ${column.name} » supprimée — Ctrl+Z pour annuler.`)
}

// ——————————————————————— Recherche et sélection ———————————————————————

const query = ref('')

const peekId = ref<string | null>(null)

watch(tasks, () => {
  // La tâche ouverte a pu disparaître : annulation, suppression de colonne.
  if (peekId.value && !data.task(peekId.value)) peekId.value = null
})

function openTask(id: string): void {
  peekId.value = id
}

/**
 * Ajout depuis une colonne. Le panneau ne s'ouvre pas : le champ reste sous
 * le doigt pour la tâche suivante — c'est tout l'intérêt de saisir d'affilée.
 */
function addTask(columnId: string, title: string): void {
  undo.run(createTask(props.sequenceId, columnId, title))
}

// ————————————————————————— Glisser-déposer —————————————————————————

/** Priorité en cours de déplacement : elle ouvre les zones de dépôt légitimes. */
const dragging = ref<Priority | null>(null)

function onDragEnd(payload: {
  taskId: string
  fromColumnId: string
  toColumnId: string
  priority: Priority
  index: number
}): void {
  dragging.value = null
  const { taskId, fromColumnId, toColumnId, priority, index } = payload
  if (!taskId || !toColumnId || !data.task(taskId)) return

  const before = data.tasksOfGroup(toColumnId, priority).map((task) => task.id)
  const next = before.filter((id) => id !== taskId)
  next.splice(index, 0, taskId)

  if (fromColumnId === toColumnId) {
    if (next.join() === before.join()) return
    undo.run(reorderTasks(toColumnId, priority, next))
    return
  }
  undo.run(moveTask(taskId, toColumnId, next))
}

// ————————————————————— Menu contextuel d'une carte —————————————————————

const menu = ref<{ taskId: string; x: number; y: number } | null>(null)

function openMenu(payload: { taskId: string; event: MouseEvent }): void {
  menu.value = { taskId: payload.taskId, x: payload.event.clientX, y: payload.event.clientY }
}

function runFromMenu(action: 'duplicate' | 'delete' | Priority): void {
  const id = menu.value?.taskId
  menu.value = null
  if (!id) return
  if (action === 'duplicate') return undo.run(duplicateTask(id))
  if (action === 'delete') {
    if (peekId.value === id) peekId.value = null
    return undo.run(deleteTask(id))
  }
  undo.run(setTaskPriority(id, action))
}

// ————————————————————————— En-tête et clavier —————————————————————————

function onRename(event: Event): void {
  const name = (event.target as HTMLInputElement).value.trim()
  if (!name || name === board.value?.name) return
  undo.run(renameSequence(props.sequenceId, name, 'tableau'))
}

/** Échap referme ce qui est ouvert, du plus local au plus large. */
function onKey(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (menu.value) menu.value = null
  else if (peekId.value) peekId.value = null
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div v-if="board" class="flex h-full min-h-0 flex-col">
    <header class="mb-3 flex shrink-0 items-center gap-2">
      <BackButton v-if="!embedded" />
      <input
        :value="board.name"
        class="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-xl font-semibold text-app-text outline-none hover:bg-app-surface focus:bg-app-surface-2"
        data-test="board-name"
        @change="onRename"
        @keydown.enter="($event.target as HTMLInputElement).blur()"
      />

      <SearchField v-model="query" test-id="board-search" :hotkey="!embedded" />

      <span class="shrink-0 text-[12px] text-app-muted">{{ tasks.length }} tâche(s)</span>
    </header>

    <p v-if="query.trim()" class="mb-2 shrink-0 text-[12px] text-app-muted">
      Recherche en cours — le glisser-déposer est suspendu tant que l'affichage est filtré.
    </p>

    <div class="flex min-h-0 flex-1 gap-3">
      <VueDraggable
        v-model="columns"
        :animation="150"
        handle=".jt-col-handle"
        ghost-class="opacity-40"
        class="flex min-h-0 flex-1 items-start gap-3 overflow-x-auto pb-2"
        @end="onColumnsMoved"
      >
        <BoardColumn
          v-for="column in columns"
          :key="column.id"
          :column="column"
          :query="query"
          :spotlit-id="spotlightId"
          :dragging="dragging"
          class="max-h-full"
          @open="openTask"
          @create="(title) => addTask(column.id, title)"
          @rename="(name) => undo.run(renameColumn(column.id, name))"
          @remove="removeColumn(column)"
          @menu="openMenu"
          @drag-start="(priority) => (dragging = priority)"
          @drag-end="onDragEnd"
        />

        <!-- Colonne fantôme : le tableau se prolonge sans quitter la vue. -->
        <div class="w-56 shrink-0">
          <input
            v-if="addingColumn"
            v-model="newColumn"
            placeholder="Nom de la colonne"
            class="w-full rounded-lg border border-app-accent bg-app-bg px-2.5 py-2 text-[13px] outline-none"
            data-test="column-composer"
            autofocus
            @keydown.enter.prevent="commitColumn"
            @keydown.esc="((addingColumn = false), (newColumn = ''))"
            @blur="commitColumn"
          />
          <button
            v-else
            class="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-app-muted transition-colors hover:bg-app-surface hover:text-app-text"
            data-test="add-column"
            @click="addingColumn = true"
          >
            <IconPlus class="size-4" /> Ajouter une colonne
          </button>
        </div>
      </VueDraggable>

      <TaskPeek
        v-if="peekId"
        :key="peekId"
        :task-id="peekId"
        @close="peekId = null"
        @removed="peekId = null"
      />
    </div>

    <!-- Menu contextuel : les gestes fréquents sans ouvrir la tâche. -->
    <template v-if="menu">
      <div class="fixed inset-0 z-40" @click="menu = null" @contextmenu.prevent="menu = null"></div>
      <div
        class="fixed z-50 w-48 overflow-hidden rounded-md border border-app-border bg-app-bg py-1 shadow-lg"
        :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
      >
        <p class="px-3 pb-1 pt-0.5 text-[11px] uppercase tracking-wide text-app-muted">Priorité</p>
        <button
          v-for="priority in PRIORITIES"
          :key="priority"
          class="w-full px-3 py-1.5 text-left text-[13px] hover:bg-app-surface-2"
          @click="runFromMenu(priority)"
        >
          {{ PRIORITY_LABELS[priority] }}
        </button>
        <div class="my-1 border-t border-app-border"></div>
        <button
          class="w-full px-3 py-1.5 text-left text-[13px] hover:bg-app-surface-2"
          @click="runFromMenu('duplicate')"
        >
          Dupliquer
        </button>
        <button
          class="w-full px-3 py-1.5 text-left text-[13px] text-red-500 hover:bg-app-surface-2"
          @click="runFromMenu('delete')"
        >
          Supprimer
        </button>
      </div>
    </template>
  </div>

  <p v-else class="text-app-muted">Ce tableau n'existe plus.</p>
</template>
