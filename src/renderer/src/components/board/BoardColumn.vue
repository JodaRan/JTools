<script setup lang="ts">
/**
 * Une colonne du tableau.
 *
 * Le point délicat est le glisser-déposer. Les cartes d'une colonne sont
 * rangées par priorité, et une priorité ne se change pas à la souris : on
 * n'expose donc pas une liste par colonne, mais **une liste par priorité**.
 * Chaque groupe appartient à un groupe Sortable qui lui est propre
 * (`tasks-urgent`, `tasks-high`…), si bien qu'une carte urgente ne peut
 * atterrir que dans les urgentes d'une autre colonne. La règle n'est pas
 * vérifiée après coup : elle est rendue impossible à enfreindre.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { useDataStore } from '@/stores/data'
import { PRIORITY_LABELS } from '@/lib/task-commands'
import TaskCard from '@/components/board/TaskCard.vue'
import { PRIORITIES, type Column, type Priority, type Task } from '@shared/models'
import IconPlus from '~icons/lucide/plus'
import IconMore from '~icons/lucide/more-horizontal'
import IconGrip from '~icons/lucide/grip-vertical'

const props = defineProps<{
  column: Column
  /** Filtre de recherche : tant qu'il est actif, l'ordre affiché est partiel. */
  query: string
  spotlitId: string | null
  /** Priorité en cours de déplacement, pour ouvrir les zones de dépôt utiles. */
  dragging: Priority | null
}>()

const emit = defineEmits<{
  open: [taskId: string]
  create: [title: string]
  rename: [name: string]
  remove: []
  menu: [payload: { taskId: string; event: MouseEvent }]
  'drag-start': [priority: Priority]
  'drag-end': [
    payload: {
      taskId: string
      fromColumnId: string
      toColumnId: string
      priority: Priority
      index: number
    }
  ]
}>()

const data = useDataStore()

const matches = (task: Task): boolean => {
  const query = props.query.trim().toLowerCase()
  if (!query) return true
  return (
    task.title.toLowerCase().includes(query) ||
    task.description.toLowerCase().includes(query) ||
    task.assignee.toLowerCase().includes(query)
  )
}

const total = computed(() => data.tasksOfColumn(props.column.id).filter(matches).length)

/**
 * Copies locales : Sortable réordonne le tableau qu'on lui confie. Le store
 * reste la source de vérité — après la commande, ce watch remet les listes
 * en accord avec lui.
 */
const groups = ref<Record<Priority, Task[]>>({ urgent: [], high: [], medium: [], low: [] })

watch(
  () => PRIORITIES.map((priority) => data.tasksOfGroup(props.column.id, priority)),
  (lists) => {
    PRIORITIES.forEach((priority, index) => {
      groups.value[priority] = lists[index].filter(matches)
    })
  },
  { immediate: true, deep: true }
)

watch(() => props.query, () => {
  PRIORITIES.forEach((priority) => {
    groups.value[priority] = data.tasksOfGroup(props.column.id, priority).filter(matches)
  })
})

/** Une recherche en cours fausserait les rangs : on ne déplace plus. */
const locked = computed(() => props.query.trim() !== '')

/** Un groupe vide ne s'ouvre qu'au passage d'une carte de sa priorité. */
const shows = (priority: Priority): boolean =>
  groups.value[priority].length > 0 || props.dragging === priority

function onEnd(event: {
  item: HTMLElement
  from: HTMLElement
  to: HTMLElement
  newIndex?: number
}): void {
  emit('drag-end', {
    taskId: event.item.dataset.taskId ?? '',
    fromColumnId: event.from.dataset.columnId ?? '',
    toColumnId: event.to.dataset.columnId ?? '',
    priority: (event.to.dataset.priority ?? 'medium') as Priority,
    index: event.newIndex ?? 0
  })
}

// —————————————————————— Ajout et renommage sur place ——————————————————————

const composing = ref(false)
const draft = ref('')
const composer = ref<HTMLTextAreaElement | null>(null)

async function startComposing(): Promise<void> {
  composing.value = true
  await nextTick()
  composer.value?.focus()
}

/** Entrée valide et laisse le champ ouvert : on enchaîne les tâches d'affilée. */
function commit(): void {
  const title = draft.value.trim()
  draft.value = ''
  if (composer.value) composer.value.style.height = 'auto'
  if (title) emit('create', title)
}

function stopComposing(): void {
  commit()
  composing.value = false
}

function grow(event: Event): void {
  const el = event.target as HTMLTextAreaElement
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

const renaming = ref(false)
const title = ref<HTMLInputElement | null>(null)

async function startRenaming(): Promise<void> {
  renaming.value = true
  await nextTick()
  title.value?.select()
}

function applyRename(): void {
  renaming.value = false
  const name = title.value?.value.trim() ?? ''
  if (name && name !== props.column.name) emit('rename', name)
}

const menu = ref(false)
</script>

<template>
  <section
    class="flex max-h-full w-72 shrink-0 flex-col rounded-lg bg-app-surface"
    :data-test-column="props.column.id"
  >
    <header class="flex shrink-0 items-center gap-1 px-2 py-2">
      <span class="jt-col-handle cursor-grab p-0.5 text-app-muted/60 hover:text-app-muted">
        <IconGrip class="size-3.5" />
      </span>

      <input
        v-if="renaming"
        ref="title"
        :value="props.column.name"
        class="min-w-0 flex-1 rounded bg-app-surface-2 px-1 py-0.5 text-[13px] font-semibold outline-none"
        @blur="applyRename"
        @keydown.enter.prevent="applyRename"
        @keydown.esc="renaming = false"
      />
      <button
        v-else
        class="min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-[13px] font-semibold hover:bg-app-surface-2"
        :title="`${props.column.name} — cliquez pour renommer`"
        @click="startRenaming"
      >
        {{ props.column.name }}
      </button>

      <span class="shrink-0 text-[11px] tabular-nums text-app-muted">{{ total }}</span>

      <button
        class="shrink-0 rounded p-1 text-app-muted transition-colors hover:bg-app-surface-2 hover:text-app-text"
        title="Ajouter une tâche"
        :data-test-add="props.column.id"
        @click="startComposing"
      >
        <IconPlus class="size-3.5" />
      </button>

      <div class="relative shrink-0">
        <button
          class="rounded p-1 text-app-muted transition-colors hover:bg-app-surface-2 hover:text-app-text"
          title="Options de la colonne"
          @click="menu = !menu"
        >
          <IconMore class="size-3.5" />
        </button>
        <div
          v-if="menu"
          class="absolute right-0 top-7 z-20 w-44 overflow-hidden rounded-md border border-app-border bg-app-bg py-1 shadow-lg"
          @mouseleave="menu = false"
        >
          <button
            class="w-full px-3 py-1.5 text-left text-[13px] hover:bg-app-surface-2"
            @click="((menu = false), startRenaming())"
          >
            Renommer
          </button>
          <button
            class="w-full px-3 py-1.5 text-left text-[13px] text-red-500 hover:bg-app-surface-2"
            @click="((menu = false), $emit('remove'))"
          >
            Supprimer la colonne
          </button>
        </div>
      </div>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      <template v-for="priority in PRIORITIES" :key="priority">
        <div
          v-show="shows(priority)"
          class="mb-1 rounded-md transition-colors"
          :class="
            props.dragging === priority && 'bg-app-accent/5 outline-1 outline-dashed outline-app-accent/40'
          "
        >
          <p
            v-if="props.dragging === priority"
            class="px-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-app-accent"
          >
            {{ PRIORITY_LABELS[priority] }}
          </p>

          <VueDraggable
            v-model="groups[priority]"
            :group="`tasks-${priority}`"
            :animation="150"
            :disabled="locked"
            ghost-class="opacity-40"
            class="flex min-h-[6px] flex-col gap-1.5 p-0.5"
            :data-column-id="props.column.id"
            :data-priority="priority"
            :class="props.dragging === priority && 'min-h-[44px]'"
            @start="$emit('drag-start', priority)"
            @end="onEnd"
          >
            <TaskCard
              v-for="task in groups[priority]"
              :key="task.id"
              :task="task"
              :spotlit="props.spotlitId === task.id"
              :dimmed="props.dragging !== null && props.dragging !== priority"
              @open="$emit('open', task.id)"
              @menu="(event) => $emit('menu', { taskId: task.id, event })"
            />
          </VueDraggable>
        </div>
      </template>

      <!-- Composeur : il reste ouvert après Entrée, pour enchaîner les ajouts. -->
      <textarea
        v-if="composing"
        ref="composer"
        v-model="draft"
        rows="1"
        placeholder="Titre de la tâche — Entrée pour valider"
        class="mt-1 w-full resize-none rounded-lg border border-app-accent bg-app-bg px-2.5 py-2 text-[13px] leading-snug outline-none placeholder:text-app-muted"
        :data-test-composer="props.column.id"
        @input="grow"
        @keydown.enter.exact.prevent="commit"
        @keydown.esc="stopComposing"
        @blur="stopComposing"
      ></textarea>

      <button
        v-else
        class="mt-1 flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-app-muted transition-colors hover:bg-app-surface-2 hover:text-app-text"
        @click="startComposing"
      >
        <IconPlus class="size-3.5" /> Nouvelle tâche
      </button>
    </div>
  </section>
</template>
