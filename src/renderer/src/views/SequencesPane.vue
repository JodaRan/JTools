<script setup lang="ts">
import { computed } from 'vue'
import { useMessage } from 'naive-ui'
import { useDataStore } from '@/stores/data'
import { useNavigation } from '@/composables/useNavigation'
import { useUndoStore } from '@/stores/undo'
import { useLegacyImport } from '@/composables/useLegacyImport'
import { toolById } from '@/tools/registry'
import { createSequence, deleteSequence, renameSequence, reorderSequences } from '@/lib/commands'
import { createBoard } from '@/lib/task-commands'
import BackButton from '@/components/common/BackButton.vue'
import ItemList, { type ListItem } from '@/components/common/ItemList.vue'
import IconImport from '~icons/lucide/download'

const props = defineProps<{ toolId: string; projectId: string }>()

const data = useDataStore()
const { openSequence } = useNavigation()
const undo = useUndoStore()
const message = useMessage()
const { importLegacy } = useLegacyImport()

const project = computed(() => data.project(props.projectId))
const tool = computed(() => toolById(props.toolId))
const isTasks = computed(() => props.toolId === 'tasks')

const items = computed<ListItem[]>(() =>
  data.sequencesOfProject(props.projectId).map((sequence) => ({
    id: sequence.id,
    name: sequence.name,
    subtitle: isTasks.value
      ? `${data.tasksOfBoard(sequence.id).length} tâche(s)`
      : `${data.visibleLines(sequence.id).length} ligne(s)`
  }))
)

function open(sequenceId: string): void {
  void openSequence(props.toolId, props.projectId, sequenceId)
}

/** Chaque outil crée le sien : un tableau naît avec ses colonnes. */
function create(name: string): void {
  undo.run(isTasks.value ? createBoard(props.projectId, name) : createSequence(props.projectId, name))
}

/** Suppression sans confirmation : c'est l'annulation qui sert de filet. */
function remove(id: string): void {
  const label = tool.value?.sequenceLabel ?? 'séquence'
  undo.run(deleteSequence(id, label))
  message.warning(`Le ${label} et son contenu ont été supprimés — Ctrl+Z pour annuler.`)
}

/** Reprise d'une sauvegarde de l'ancien outil, dans ce projet. */
async function importOne(): Promise<void> {
  const outcome = await importLegacy('file', props.toolId, props.projectId)
  if (outcome?.firstBoardId) open(outcome.firstBoardId)
}
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <div class="flex items-center gap-2">
      <BackButton />
      <h1 class="min-w-0 flex-1 truncate text-xl font-semibold">
        {{ project?.name ?? 'Projet introuvable' }}
      </h1>
      <button
        v-if="isTasks"
        class="flex shrink-0 items-center gap-1.5 rounded-md border border-app-border px-2.5 py-1.5 text-[12px] text-app-muted transition-colors hover:border-app-accent hover:text-app-text"
        title="Reprendre un tableau de l'ancien gestionnaire de tâches"
        data-test="import-board"
        @click="importOne"
      >
        <IconImport class="size-3.5" />
        Importer un tableau
      </button>
    </div>
    <p class="mt-1 text-[13px] text-app-muted">
      <template v-if="isTasks">
        Les tableaux de ce projet. Ouvrez-en un pour organiser ses tâches.
      </template>
      <template v-else>
        Les séquences de ce projet. Ouvrez-en une pour éditer ses lignes.
      </template>
    </p>

    <div class="mt-6">
      <ItemList
        :items="items"
        :add-placeholder="tool?.createPlaceholder ?? 'Nouvel élément — tapez un nom puis Entrée'"
        :empty-hint="`Aucun ${tool?.sequenceLabel ?? 'élément'} pour l'instant.`"
        @open="open"
        @create="create"
        @rename="(id, name) => undo.run(renameSequence(id, name, tool?.sequenceLabel))"
        @remove="remove"
        @reorder="(ids) => undo.run(reorderSequences(props.projectId, ids))"
      />
    </div>
  </div>
</template>
