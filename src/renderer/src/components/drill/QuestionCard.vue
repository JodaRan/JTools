<script setup lang="ts">
/**
 * Une question, de l'énoncé au corrigé.
 *
 * La carte ne connaît qu'un état : la réponse déjà donnée, ou rien. Tant
 * qu'on n'a pas validé, le corrigé n'existe pas à l'écran — c'est la seule
 * façon de s'entraîner pour de bon. Une fois validé, la réponse attendue et
 * l'explication apparaissent et restent : on relit sa série sans la refaire.
 */
import { computed, ref, watch } from 'vue'
import { NDropdown } from 'naive-ui'
import type { DrillAnswer, Question } from '@shared/models'
import IconCheck from '~icons/lucide/check'
import IconX from '~icons/lucide/x'
import IconBook from '~icons/lucide/book-open'
import IconMore from '~icons/lucide/more-vertical'
import IconRetry from '~icons/lucide/rotate-ccw'

const props = defineProps<{
  question: Question
  answer?: DrillAnswer
  /** Rang affiché, à partir de 1. */
  position: number
}>()

const emit = defineEmits<{
  answer: [value: string]
  reset: []
  lesson: []
  remove: []
}>()

const draft = ref('')

// Revenir sur une question déjà faite doit remontrer ce qu'on avait répondu.
watch(
  () => props.answer,
  (answer) => {
    draft.value = answer?.value ?? ''
  },
  { immediate: true }
)

const done = computed(() => props.answer !== undefined)
const hasLesson = computed(
  () => props.question.lesson.trim() !== '' || props.question.lessonUrl.trim() !== ''
)

function submit(): void {
  const value = draft.value.trim()
  if (!value || done.value) return
  emit('answer', value)
}

function choose(choice: string): void {
  if (done.value) return
  emit('answer', choice)
}

/** L'état d'une option après validation : la bonne, la mauvaise, ou rien. */
function toneOf(choice: string): 'right' | 'wrong' | 'plain' {
  if (!done.value) return 'plain'
  if (choice === props.question.answer) return 'right'
  return choice === props.answer?.value ? 'wrong' : 'plain'
}

const menuOptions = [{ key: 'remove', label: 'Supprimer la question' }]
</script>

<template>
  <article
    class="rounded-lg border bg-app-surface p-4"
    :class="
      done
        ? answer?.correct
          ? 'border-emerald-500/40'
          : 'border-red-500/40'
        : 'border-app-border'
    "
    :data-test-question="question.id"
  >
    <div class="mb-2 flex items-center gap-2">
      <span class="text-[11px] font-medium tabular-nums text-app-muted">
        Q{{ position }}
      </span>
      <span
        v-if="done"
        class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]"
        :class="
          answer?.correct
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'bg-red-500/10 text-red-600 dark:text-red-400'
        "
        :data-test-verdict="answer?.correct ? 'right' : 'wrong'"
      >
        <component :is="answer?.correct ? IconCheck : IconX" class="size-3" />
        {{ answer?.correct ? 'Juste' : 'Faux' }}
      </span>

      <span class="ml-auto flex items-center gap-0.5">
        <button
          v-if="hasLesson"
          class="flex items-center gap-1 rounded px-1.5 py-1 text-[12px] text-app-muted transition-colors hover:bg-app-surface-2 hover:text-app-accent"
          title="Afficher la leçon dans le panneau de droite"
          :data-test-lesson="question.id"
          @click="emit('lesson')"
        >
          <IconBook class="size-3.5" />
          Leçon
        </button>
        <button
          v-if="done"
          class="rounded p-1 text-app-muted transition-colors hover:bg-app-surface-2 hover:text-app-text"
          title="Refaire cette question"
          :data-test-retry="question.id"
          @click="emit('reset')"
        >
          <IconRetry class="size-3.5" />
        </button>
        <NDropdown
          trigger="click"
          :options="menuOptions"
          placement="bottom-end"
          @select="() => emit('remove')"
        >
          <button
            class="rounded p-1 text-app-muted transition-colors hover:bg-app-surface-2 hover:text-app-text"
            title="Autres actions"
          >
            <IconMore class="size-3.5" />
          </button>
        </NDropdown>
      </span>
    </div>

    <p class="text-[14px] whitespace-pre-wrap">{{ question.prompt }}</p>
    <p v-if="question.description" class="mt-1 text-[12px] text-app-muted whitespace-pre-wrap">
      {{ question.description }}
    </p>

    <!-- Choix : une option par ligne, cliquable tant qu'on n'a pas validé -->
    <div v-if="question.kind === 'choice'" class="mt-3 flex flex-col gap-1.5">
      <button
        v-for="(choice, index) in question.choices"
        :key="index"
        class="flex items-start gap-2 rounded-md border px-2.5 py-2 text-left text-[13px] transition-colors"
        :class="[
          toneOf(choice) === 'right'
            ? 'border-emerald-500/50 bg-emerald-500/10'
            : toneOf(choice) === 'wrong'
              ? 'border-red-500/50 bg-red-500/10'
              : 'border-app-border',
          done ? 'cursor-default' : 'hover:border-app-accent'
        ]"
        :disabled="done"
        :data-test-choice="index"
        @click="choose(choice)"
      >
        <span class="mt-px shrink-0 text-[11px] font-medium text-app-muted">
          {{ String.fromCharCode(65 + index) }}
        </span>
        <span class="min-w-0 flex-1 whitespace-pre-wrap">{{ choice }}</span>
      </button>
    </div>

    <!-- Nombre : saisie libre, Entrée valide -->
    <div v-else class="mt-3 flex items-center gap-2">
      <input
        v-model="draft"
        :readonly="done"
        inputmode="decimal"
        placeholder="Votre réponse"
        class="w-40 rounded-md border border-app-border bg-app-bg px-2.5 py-1.5 text-[13px] outline-none focus:border-app-accent read-only:text-app-muted"
        :data-test-input="question.id"
        @keydown.enter.prevent="submit"
      />
      <button
        v-if="!done"
        class="rounded-md border border-app-border px-2.5 py-1.5 text-[12px] transition-colors hover:border-app-accent hover:text-app-text"
        :data-test-submit="question.id"
        @click="submit"
      >
        Vérifier
      </button>
    </div>

    <!-- Corrigé : il n'apparaît qu'une fois la réponse donnée -->
    <div v-if="done" class="mt-3 border-t border-app-border pt-2.5">
      <p v-if="!answer?.correct" class="text-[13px]">
        <span class="text-app-muted">Réponse attendue :</span>
        <span class="ml-1 font-medium" data-test-expected>{{ question.answer }}</span>
      </p>
      <p
        v-if="question.explanation"
        class="mt-1 text-[13px] text-app-muted whitespace-pre-wrap"
      >
        {{ question.explanation }}
      </p>
    </div>
  </article>
</template>
