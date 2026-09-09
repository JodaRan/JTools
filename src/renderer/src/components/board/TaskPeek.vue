<script setup lang="ts">
/**
 * Panneau de détail d'une tâche.
 *
 * C'est le « peek » de Notion : il s'ouvre à côté du tableau, pas par-dessus.
 * Aucune modale, aucun bouton « enregistrer » — chaque champ écrit dans le
 * store à la frappe, et la frappe continue se replie en une seule annulation.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useDataStore } from '@/stores/data'
import { useUndoStore } from '@/stores/undo'
import {
  ESTIMATE_LABELS,
  PRIORITY_LABELS,
  addAssignee,
  deleteTask,
  duplicateTask,
  moveTask,
  renameTask,
  setTaskAssignee,
  setTaskDate,
  setTaskDescription,
  setTaskDueDate,
  setTaskEstimate,
  setTaskPriority
} from '@/lib/task-commands'
import AssigneePicker from '@/components/board/AssigneePicker.vue'
import PriorityTag from '@/components/board/PriorityTag.vue'
import { ESTIMATES, PRIORITIES, type Estimate, type Priority } from '@shared/models'
import IconClose from '~icons/lucide/x'
import IconCopy from '~icons/lucide/copy-plus'
import IconTrash from '~icons/lucide/trash-2'

const props = defineProps<{ taskId: string }>()
const emit = defineEmits<{ close: []; removed: [] }>()

const data = useDataStore()
const undo = useUndoStore()

const task = computed(() => data.task(props.taskId))
const board = computed(() => (task.value ? data.board(task.value.boardId) : undefined))
const columns = computed(() => (task.value ? data.columnsOfBoard(task.value.boardId) : []))

const title = ref<HTMLTextAreaElement | null>(null)
const description = ref<HTMLTextAreaElement | null>(null)

/** Ajuste un champ à son contenu : le détail se lit d'un coup d'œil. */
const fit = (el: HTMLTextAreaElement | null): void => {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

watch(
  () => props.taskId,
  async () => {
    await nextTick()
    fit(title.value)
    fit(description.value)
  },
  { immediate: true }
)

const onTitle = (event: Event): void => {
  const el = event.target as HTMLTextAreaElement
  fit(el)
  undo.run(renameTask(props.taskId, el.value))
}

const onDescription = (event: Event): void => {
  const el = event.target as HTMLTextAreaElement
  fit(el)
  undo.run(setTaskDescription(props.taskId, el.value))
}

/** Changer de colonne au clavier : même commande que le glisser-déposer. */
function onColumn(event: Event): void {
  const columnId = (event.target as HTMLSelectElement).value
  const current = task.value
  if (!current || columnId === current.columnId) return
  const target = data
    .tasksOfGroup(columnId, current.priority)
    .map((item) => item.id)
    .filter((id) => id !== current.id)
  undo.run(moveTask(current.id, columnId, [...target, current.id]))
}

function onPriority(priority: Priority): void {
  if (task.value?.priority === priority) return
  undo.run(setTaskPriority(props.taskId, priority))
}

function onEstimate(estimate: Estimate): void {
  undo.run(setTaskEstimate(props.taskId, task.value?.estimate === estimate ? '' : estimate))
}

function onAssignee(name: string): void {
  undo.run(setTaskAssignee(props.taskId, name))
}

function onAddAssignee(name: string): void {
  if (task.value) undo.run(addAssignee(task.value.boardId, name))
}

function remove(): void {
  undo.run(deleteTask(props.taskId))
  emit('removed')
}

function duplicate(): void {
  undo.run(duplicateTask(props.taskId))
}

const columnName = computed(
  () => columns.value.find((column) => column.id === task.value?.columnId)?.name ?? ''
)

const stamp = (iso: string): string =>
  iso
    ? new Date(iso).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : '—'
</script>

<template>
  <aside
    v-if="task"
    class="flex w-[22rem] shrink-0 flex-col overflow-y-auto border-l border-app-border bg-app-bg"
    data-test="task-peek"
    @keydown.esc="$emit('close')"
  >
    <header class="flex items-center gap-2 border-b border-app-border px-3 py-2">
      <PriorityTag :priority="task.priority" dot />
      <span class="min-w-0 flex-1 truncate text-[12px] text-app-muted">{{ columnName }}</span>
      <button
        class="rounded p-1 text-app-muted transition-colors hover:bg-app-surface-2 hover:text-app-text"
        title="Dupliquer"
        @click="duplicate"
      >
        <IconCopy class="size-4" />
      </button>
      <button
        class="rounded p-1 text-app-muted transition-colors hover:bg-app-surface-2 hover:text-red-500"
        title="Supprimer la tâche"
        data-test="task-delete"
        @click="remove"
      >
        <IconTrash class="size-4" />
      </button>
      <button
        class="rounded p-1 text-app-muted transition-colors hover:bg-app-surface-2 hover:text-app-text"
        title="Fermer (Échap)"
        data-test="peek-close"
        @click="$emit('close')"
      >
        <IconClose class="size-4" />
      </button>
    </header>

    <div class="px-3 py-3">
      <textarea
        ref="title"
        :value="task.title"
        rows="1"
        placeholder="Sans titre"
        class="w-full resize-none bg-transparent text-[16px] font-semibold leading-snug outline-none placeholder:text-app-muted"
        data-test="task-title"
        @input="onTitle"
        @keydown.enter.prevent="($event.target as HTMLTextAreaElement).blur()"
      ></textarea>

      <dl class="mt-4 space-y-1 text-[13px]">
        <div class="flex items-start gap-2">
          <dt class="w-24 shrink-0 py-1 text-[12px] text-app-muted">Colonne</dt>
          <dd class="min-w-0 flex-1">
            <select
              :value="task.columnId"
              class="w-full rounded bg-transparent px-1.5 py-1 text-[13px] outline-none hover:bg-app-surface-2"
              data-test="task-column"
              @change="onColumn"
            >
              <option v-for="column in columns" :key="column.id" :value="column.id">
                {{ column.name }}
              </option>
            </select>
          </dd>
        </div>

        <div class="flex items-start gap-2">
          <dt class="w-24 shrink-0 py-1 text-[12px] text-app-muted">Priorité</dt>
          <dd class="flex min-w-0 flex-1 flex-wrap gap-1 py-0.5">
            <button
              v-for="priority in PRIORITIES"
              :key="priority"
              class="rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors"
              :class="
                task.priority === priority
                  ? 'ring-1 ring-app-accent'
                  : 'text-app-muted hover:bg-app-surface-2'
              "
              :data-test-set-priority="priority"
              @click="onPriority(priority)"
            >
              <PriorityTag v-if="task.priority === priority" :priority="priority" />
              <template v-else>{{ PRIORITY_LABELS[priority] }}</template>
            </button>
          </dd>
        </div>

        <div class="flex items-start gap-2">
          <dt class="w-24 shrink-0 py-1 text-[12px] text-app-muted">Assigné</dt>
          <dd class="min-w-0 flex-1">
            <AssigneePicker
              :value="task.assignee"
              :assignees="board?.assignees ?? []"
              @select="onAssignee"
              @add="onAddAssignee"
            />
          </dd>
        </div>

        <div class="flex items-start gap-2">
          <dt class="w-24 shrink-0 py-1 text-[12px] text-app-muted">Estimation</dt>
          <dd class="flex min-w-0 flex-1 flex-wrap gap-1 py-0.5">
            <button
              v-for="size in ESTIMATES"
              :key="size"
              class="min-w-8 rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors"
              :class="
                task.estimate === size
                  ? 'bg-app-accent/15 text-app-accent ring-1 ring-app-accent'
                  : 'text-app-muted hover:bg-app-surface-2'
              "
              :title="task.estimate === size ? 'Cliquer pour retirer' : ESTIMATE_LABELS[size]"
              @click="onEstimate(size)"
            >
              {{ ESTIMATE_LABELS[size] }}
            </button>
          </dd>
        </div>

        <div class="flex items-start gap-2">
          <dt class="w-24 shrink-0 py-1 text-[12px] text-app-muted">Date</dt>
          <dd class="min-w-0 flex-1">
            <input
              type="date"
              :value="task.date"
              class="w-full rounded bg-transparent px-1.5 py-1 text-[13px] outline-none hover:bg-app-surface-2"
              @change="undo.run(setTaskDate(taskId, ($event.target as HTMLInputElement).value))"
            />
          </dd>
        </div>

        <div class="flex items-start gap-2">
          <dt class="w-24 shrink-0 py-1 text-[12px] text-app-muted">Échéance</dt>
          <dd class="min-w-0 flex-1">
            <input
              type="date"
              :value="task.dueDate"
              class="w-full rounded bg-transparent px-1.5 py-1 text-[13px] outline-none hover:bg-app-surface-2"
              data-test="task-due"
              @change="undo.run(setTaskDueDate(taskId, ($event.target as HTMLInputElement).value))"
            />
          </dd>
        </div>

        <div class="flex items-start gap-2">
          <dt class="w-24 shrink-0 py-1 text-[12px] text-app-muted">Statut modifié</dt>
          <dd class="min-w-0 flex-1 px-1.5 py-1 text-app-muted">
            {{ stamp(task.statusChangedAt) }}
          </dd>
        </div>

        <div class="flex items-start gap-2">
          <dt class="w-24 shrink-0 py-1 text-[12px] text-app-muted">Créée</dt>
          <dd class="min-w-0 flex-1 px-1.5 py-1 text-app-muted">{{ stamp(task.createdAt) }}</dd>
        </div>
      </dl>

      <textarea
        ref="description"
        :value="task.description"
        rows="3"
        placeholder="Description — notes, critères, liens…"
        class="mt-4 w-full resize-none rounded-md border border-transparent bg-app-surface px-2.5 py-2 text-[13px] leading-relaxed outline-none placeholder:text-app-muted focus:border-app-border"
        data-test="task-description"
        @input="onDescription"
      ></textarea>
    </div>
  </aside>
</template>
