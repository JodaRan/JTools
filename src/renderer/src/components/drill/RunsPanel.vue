<script setup lang="ts">
/**
 * Les séries archivées d'une partie.
 *
 * Réinitialiser un score n'efface rien : le résultat et les réponses sont
 * rangés ici. C'est ce qui permet de refaire une série un mois plus tard et
 * de savoir si l'on a progressé, plutôt que de le croire.
 */
import { computed, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import type { DrillRun } from '@shared/models'
import IconChevron from '~icons/lucide/chevron-right'

const props = defineProps<{ setId: string | null }>()

const data = useDataStore()

const runs = computed<DrillRun[]>(() => (props.setId ? data.runsOfSet(props.setId) : []))

const openId = ref<string | null>(null)

const toggle = (id: string): void => {
  openId.value = openId.value === id ? null : id
}

const dateOf = (iso: string): string =>
  new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })

/** L'énoncé d'une question peut avoir disparu depuis : on garde la réponse. */
const promptOf = (questionId: string): string =>
  data.question(questionId)?.prompt ?? 'Question supprimée depuis'
</script>

<template>
  <div class="min-h-0 flex-1 overflow-auto p-2">
    <p v-if="!setId" class="p-2 text-[12px] text-app-muted">
      Ouvrez une partie pour voir ses séries.
    </p>
    <p v-else-if="runs.length === 0" class="p-2 text-[12px] text-app-muted">
      Aucune série archivée. « Réinitialiser » range le score en cours ici avant de repartir
      de zéro.
    </p>

    <ul class="flex flex-col gap-0.5">
      <li v-for="run in runs" :key="run.id" :data-test-run="run.id">
        <button
          class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-app-surface-2"
          @click="toggle(run.id)"
        >
          <IconChevron
            class="size-3.5 shrink-0 text-app-muted transition-transform"
            :class="openId === run.id && 'rotate-90'"
          />
          <span class="text-[12px] tabular-nums">
            <strong>{{ run.correct }}</strong> / {{ run.answered }}
          </span>
          <span class="ml-auto text-[11px] text-app-muted">{{ dateOf(run.at) }}</span>
        </button>

        <ul v-if="openId === run.id" class="mb-1 flex flex-col gap-1 px-2 pb-1 pl-7">
          <li
            v-for="answer in run.answers"
            :key="answer.questionId"
            class="border-l-2 pl-2 text-[11.5px]"
            :class="answer.correct ? 'border-emerald-500/50' : 'border-red-500/50'"
          >
            <p class="text-app-muted">{{ promptOf(answer.questionId) }}</p>
            <p>{{ answer.value }}</p>
          </li>
        </ul>
      </li>
    </ul>
  </div>
</template>
