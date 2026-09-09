<script setup lang="ts">
/**
 * Carte de tâche. Elle porte le strict nécessaire pour décider sans l'ouvrir :
 * le titre, qui s'en occupe, et l'urgence. Le reste vit dans le panneau.
 */
import { computed } from 'vue'
import { ESTIMATE_LABELS } from '@/lib/task-commands'
import PriorityTag from '@/components/board/PriorityTag.vue'
import { UNASSIGNED, type Task } from '@shared/models'
import IconCalendar from '~icons/lucide/calendar-clock'

const props = defineProps<{ task: Task; spotlit?: boolean; dimmed?: boolean }>()
defineEmits<{ open: []; menu: [event: MouseEvent] }>()

const assigned = computed(() => props.task.assignee !== UNASSIGNED)

/** Initiales : dans une colonne étroite, deux lettres valent un nom entier. */
const initials = computed(() =>
  props.task.assignee
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
)

const dueLabel = computed(() => {
  if (!props.task.dueDate) return ''
  const [year, month, day] = props.task.dueDate.split('-')
  return `${day}/${month}${year === String(new Date().getFullYear()) ? '' : `/${year.slice(2)}`}`
})

/** Une échéance dépassée sur une carte encore ouverte mérite d'être vue. */
const late = computed(
  () => props.task.dueDate !== '' && props.task.dueDate < new Date().toISOString().slice(0, 10)
)
</script>

<template>
  <article
    class="group cursor-pointer rounded-lg border bg-app-bg px-2.5 py-2 transition-colors"
    :class="[
      props.spotlit
        ? 'border-app-accent ring-2 ring-app-accent/40'
        : 'border-app-border hover:border-app-accent/60',
      props.dimmed && 'opacity-30'
    ]"
    :data-spot="props.task.id"
    :data-task-id="props.task.id"
    :data-test-task="props.task.id"
    @click="$emit('open')"
    @contextmenu.prevent="$emit('menu', $event)"
  >
    <p class="text-[13px] leading-snug text-app-text">
      {{ props.task.title || 'Sans titre' }}
    </p>

    <div class="mt-2 flex flex-wrap items-center gap-1.5">
      <PriorityTag :priority="props.task.priority" dot />

      <span
        v-if="props.task.estimate"
        class="rounded bg-app-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-app-muted"
        :title="`Estimation ${ESTIMATE_LABELS[props.task.estimate]}`"
      >
        {{ ESTIMATE_LABELS[props.task.estimate] }}
      </span>

      <span
        v-if="dueLabel"
        class="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px]"
        :class="late ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'text-app-muted'"
        :title="`Échéance ${props.task.dueDate}`"
      >
        <IconCalendar class="size-3" />
        {{ dueLabel }}
      </span>

      <span
        class="ml-auto inline-flex min-w-0 items-center gap-1 text-[11px]"
        :class="assigned ? 'text-app-text' : 'text-app-muted'"
        :title="props.task.assignee"
      >
        <span
          v-if="assigned"
          class="grid size-[18px] shrink-0 place-items-center rounded-full bg-app-accent/20 text-[9px] font-semibold text-app-accent"
        >
          {{ initials }}
        </span>
        <span class="max-w-[8rem] truncate">{{ props.task.assignee }}</span>
      </span>
    </div>
  </article>
</template>
