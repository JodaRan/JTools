<script setup lang="ts">
/**
 * Pastille de priorité. C'est le seul repère coloré du tableau : la couleur y
 * veut dire une chose et une seule, l'urgence.
 */
import { computed } from 'vue'
import { PRIORITY_LABELS } from '@/lib/task-commands'
import type { Priority } from '@shared/models'

const props = defineProps<{ priority: Priority; dot?: boolean }>()

const TONES: Record<Priority, string> = {
  urgent: 'bg-red-500/15 text-red-600 dark:text-red-400',
  high: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  medium: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  low: 'bg-slate-500/15 text-slate-600 dark:text-slate-400'
}

const DOTS: Record<Priority, string> = {
  urgent: 'bg-red-500',
  high: 'bg-amber-500',
  medium: 'bg-sky-500',
  low: 'bg-slate-400'
}

const label = computed(() => PRIORITY_LABELS[props.priority])
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium"
    :class="TONES[props.priority]"
    :data-test-priority="props.priority"
  >
    <span v-if="props.dot" class="size-1.5 rounded-full" :class="DOTS[props.priority]"></span>
    {{ label }}
  </span>
</template>
