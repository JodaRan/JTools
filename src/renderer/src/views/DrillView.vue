<script setup lang="ts">
/**
 * Vue finale de l'outil « Exercices » : une partie, ses questions, son score.
 *
 * Deux règles lui sont propres. Le contenu entre par CSV — on ne saisit pas
 * quarante questions à la main dans une application de bureau — et ce geste-là
 * est annulable, comme tout ce qui touche au document. Répondre, en revanche,
 * ne l'est pas : la pile d'annulation ne connaît pas les exercices, seul le
 * bouton « Refaire » revient en arrière, question par question.
 */
import { computed, onMounted, ref } from 'vue'
import { NDropdown, useMessage } from 'naive-ui'
import { useDataStore } from '@/stores/data'
import { useUndoStore } from '@/stores/undo'
import { useDrillPanel } from '@/composables/useDrillPanel'
import { renameSequence } from '@/lib/commands'
import {
  answerQuestion,
  archiveAndReset,
  clearQuestions,
  deleteQuestion,
  ensureDrillRecords,
  importQuestions,
  parseQuestionCsv,
  questionsToCsv
} from '@/lib/drill-commands'
import BackButton from '@/components/common/BackButton.vue'
import QuestionCard from '@/components/drill/QuestionCard.vue'
import IconImport from '~icons/lucide/file-up'
import IconGuide from '~icons/lucide/sparkles'
import IconRuns from '~icons/lucide/history'
import IconReset from '~icons/lucide/rotate-ccw'
import IconMore from '~icons/lucide/more-vertical'

const props = defineProps<{
  toolId: string
  projectId: string
  sequenceId: string
  embedded?: boolean
}>()

const data = useDataStore()
const undo = useUndoStore()
const message = useMessage()
const { showLesson, showPanel } = useDrillPanel()

const part = computed(() => data.sequence(props.sequenceId))
const questions = computed(() => data.questionsOfSet(props.sequenceId))
const score = computed(() => data.scoreOfSet(props.sequenceId))

/**
 * Une partie ouverte sans son enregistrement propre n'aurait nulle part où
 * compter le score. Le cas arrive à la marge — séquence créée par un autre
 * outil, sauvegarde recollée à la main — et se répare une fois pour toutes.
 */
onMounted(() => {
  if (!part.value) return
  if (data.drillSet(props.sequenceId) && data.drillType(props.projectId)) return
  undo.run(ensureDrillRecords(props.projectId, props.sequenceId))
})

// ————————————————————————————— Affichage —————————————————————————————

type Filter = 'all' | 'todo' | 'wrong'

const filter = ref<Filter>('all')

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Toutes' },
  { key: 'todo', label: 'Sans réponse' },
  { key: 'wrong', label: 'Ratées' }
]

const shown = computed(() =>
  questions.value.filter((question) => {
    const answer = data.answerOf(props.sequenceId, question.id)
    if (filter.value === 'todo') return answer === undefined
    if (filter.value === 'wrong') return answer !== undefined && !answer.correct
    return true
  })
)

/** Le rang affiché reste celui de la question dans la partie, filtre ou pas. */
const positionOf = (id: string): number =>
  questions.value.findIndex((question) => question.id === id) + 1

// ————————————————————————————— Réponses —————————————————————————————

function onAnswer(questionId: string, value: string): void {
  const question = data.question(questionId)
  if (!question) return
  answerQuestion(props.sequenceId, question, value)
}

function reset(): void {
  const run = archiveAndReset(props.sequenceId)
  if (!run) {
    message.info('Aucune réponse à remettre à zéro.')
    return
  }
  message.success(
    `Série archivée : ${run.correct} / ${run.answered}. Le compteur repart de zéro.`
  )
  showPanel('runs')
}

// ————————————————————————————— CSV —————————————————————————————

/**
 * Le presse-papiers autant que le fichier : ce qu'un LLM rend, on l'a le plus
 * souvent copié, et passer par un fichier n'ajouterait qu'un détour.
 */
const IMPORT_OPTIONS = [
  {
    type: 'group',
    label: 'Depuis un fichier CSV',
    key: 'file',
    children: [
      { key: 'file:append', label: 'Ajouter à la suite' },
      { key: 'file:replace', label: 'Remplacer toutes les questions' }
    ]
  },
  {
    type: 'group',
    label: 'Depuis le presse-papiers',
    key: 'clipboard',
    children: [
      { key: 'clip:append', label: 'Coller à la suite' },
      { key: 'clip:replace', label: 'Coller en remplaçant tout' }
    ]
  }
]

async function importCsv(key: string | number): Promise<void> {
  const [source, mode] = String(key).split(':')

  let text = ''
  let origin = 'le presse-papiers'
  if (source === 'clip') {
    text = await window.jtools.clipboard.read()
  } else {
    const picked = await window.jtools.file.openText(['csv'])
    if (!picked) return
    text = picked.text
    origin = `« ${picked.name} »`
  }

  const parsed = parseQuestionCsv(text)
  if (parsed.questions.length === 0) {
    message.error(`Aucune question exploitable dans ${origin} — vérifiez les en-têtes du CSV.`)
    return
  }

  const command = importQuestions(
    props.sequenceId,
    parsed.questions,
    mode === 'replace' ? 'replace' : 'append'
  )
  undo.run(command)

  if (parsed.skipped.length === 0) {
    message.success(`${command.added} question(s) importée(s) — Ctrl+Z pour annuler.`)
  } else {
    const first = parsed.skipped[0]
    message.warning(
      `${command.added} question(s) importée(s), ${parsed.skipped.length} ligne(s) écartée(s) — ligne ${first.row} : ${first.reason}.`
    )
  }
}

async function exportCsv(): Promise<void> {
  if (questions.value.length === 0) {
    message.info('Cette partie ne contient aucune question à exporter.')
    return
  }
  const name = (part.value?.name ?? 'exercices').replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()
  const path = await window.jtools.file.saveText(`${name}.csv`, questionsToCsv(questions.value))
  if (path) message.success('Exporté.')
}

function clearAll(): void {
  if (questions.value.length === 0) return
  undo.run(clearQuestions(props.sequenceId))
  message.warning('Partie vidée — Ctrl+Z pour annuler.')
}

function removeQuestion(id: string): void {
  undo.run(deleteQuestion(id))
  message.warning('Question supprimée — Ctrl+Z pour annuler.')
}

const MORE_OPTIONS = computed(() => [
  { key: 'export', label: 'Exporter en CSV' },
  { key: 'clear', label: 'Vider la partie', disabled: questions.value.length === 0 }
])

function onMore(key: string | number): void {
  if (key === 'export') void exportCsv()
  if (key === 'clear') clearAll()
}

function onRename(event: Event): void {
  const name = (event.target as HTMLInputElement).value.trim()
  if (!name || name === part.value?.name) return
  undo.run(renameSequence(props.sequenceId, name, 'partie'))
}
</script>

<template>
  <div v-if="part" class="mx-auto max-w-3xl">
    <header class="flex items-center gap-2">
      <BackButton v-if="!embedded" />
      <input
        :value="part.name"
        class="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-xl font-semibold text-app-text outline-none hover:bg-app-surface focus:bg-app-surface-2"
        data-test="part-name"
        @change="onRename"
        @keydown.enter="($event.target as HTMLInputElement).blur()"
      />

      <NDropdown trigger="click" :options="IMPORT_OPTIONS" @select="importCsv">
        <button
          class="flex shrink-0 items-center gap-1.5 rounded-md border border-app-border px-2.5 py-1.5 text-[12px] text-app-muted transition-colors hover:border-app-accent hover:text-app-text"
          title="Importer un CSV de questions"
          data-test="import-csv"
        >
          <IconImport class="size-3.5" />
          Importer
        </button>
      </NDropdown>

      <button
        class="flex shrink-0 items-center gap-1.5 rounded-md border border-app-border px-2.5 py-1.5 text-[12px] text-app-muted transition-colors hover:border-app-accent hover:text-app-text"
        title="Guide de prompt de ce type d'exercice"
        data-test="open-guide"
        @click="showPanel('guide')"
      >
        <IconGuide class="size-3.5" />
        Guide
      </button>

      <NDropdown trigger="click" :options="MORE_OPTIONS" @select="onMore">
        <button
          class="shrink-0 rounded p-1.5 text-app-muted transition-colors hover:bg-app-surface-2 hover:text-app-text"
          title="Autres actions"
          data-test="drill-more"
        >
          <IconMore class="size-4" />
        </button>
      </NDropdown>
    </header>

    <!-- Score : ce qu'on est venu chercher, donc juste sous le titre -->
    <div class="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-app-surface px-3 py-2">
      <p class="text-[13px]" data-test="score">
        <span class="text-lg font-semibold tabular-nums">{{ score.correct }}</span>
        <span class="text-app-muted"> / {{ score.answered }} correctes</span>
      </p>
      <p class="text-[12px] text-app-muted">
        {{ score.answered }} répondue(s) sur {{ score.total }} question(s)
      </p>

      <span class="ml-auto flex items-center gap-1">
        <button
          class="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-app-muted transition-colors hover:bg-app-surface-2 hover:text-app-text"
          title="Les séries déjà archivées"
          data-test="open-runs"
          @click="showPanel('runs')"
        >
          <IconRuns class="size-3.5" />
          Séries
        </button>
        <button
          class="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-app-muted transition-colors hover:bg-app-surface-2 hover:text-app-text"
          title="Archiver le score et les réponses, puis repartir de zéro"
          data-test="reset-score"
          @click="reset"
        >
          <IconReset class="size-3.5" />
          Réinitialiser
        </button>
      </span>
    </div>

    <!-- Partie vide : dire la marche à suivre plutôt qu'un écran blanc -->
    <div
      v-if="questions.length === 0"
      class="mt-6 rounded-lg border border-dashed border-app-border p-6 text-[13px] text-app-muted"
    >
      <p class="text-app-text">Cette partie n'a pas encore de questions.</p>
      <ol class="mt-2 flex list-decimal flex-col gap-1 pl-4">
        <li>Ouvrez le <strong>Guide</strong> et copiez-le.</li>
        <li>Collez-le dans un LLM, en précisant le nombre d'exercices voulu.</li>
        <li>Enregistrez sa réponse en <code>.csv</code>, puis <strong>Importer</strong>.</li>
      </ol>
    </div>

    <template v-else>
      <div class="mt-4 flex items-center gap-1">
        <button
          v-for="option in FILTERS"
          :key="option.key"
          class="rounded px-2 py-1 text-[12px] transition-colors"
          :class="
            filter === option.key
              ? 'bg-app-surface-2 text-app-text'
              : 'text-app-muted hover:text-app-text'
          "
          :data-test-filter="option.key"
          @click="filter = option.key"
        >
          {{ option.label }}
        </button>
        <span class="ml-auto text-[12px] text-app-muted">
          {{ shown.length }} affichée(s)
        </span>
      </div>

      <p v-if="shown.length === 0" class="mt-6 text-[13px] text-app-muted">
        Rien à montrer avec ce filtre.
      </p>

      <div class="mt-3 flex flex-col gap-3 pb-6">
        <QuestionCard
          v-for="question in shown"
          :key="question.id"
          :question="question"
          :answer="data.answerOf(props.sequenceId, question.id)"
          :position="positionOf(question.id)"
          @answer="(value) => onAnswer(question.id, value)"
          @reset="data.clearDrillAnswer(props.sequenceId, question.id)"
          @lesson="showLesson(question.id)"
          @remove="removeQuestion(question.id)"
        />
      </div>
    </template>
  </div>

  <p v-else class="text-app-muted">Cette partie n'existe plus.</p>
</template>
