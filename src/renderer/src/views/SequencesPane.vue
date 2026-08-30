<script setup lang="ts">
import { computed } from 'vue'
import { useMessage } from 'naive-ui'
import { useDataStore } from '@/stores/data'
import { useNavigation } from '@/composables/useNavigation'
import { useUndoStore } from '@/stores/undo'
import { createSequence, deleteSequence, renameSequence, reorderSequences } from '@/lib/commands'
import BackButton from '@/components/common/BackButton.vue'
import ItemList, { type ListItem } from '@/components/common/ItemList.vue'

const props = defineProps<{ toolId: string; projectId: string }>()

const data = useDataStore()
const { openSequence } = useNavigation()
const undo = useUndoStore()
const message = useMessage()

const project = computed(() => data.project(props.projectId))

const items = computed<ListItem[]>(() =>
  data.sequencesOfProject(props.projectId).map((sequence) => ({
    id: sequence.id,
    name: sequence.name,
    subtitle: `${data.visibleLines(sequence.id).length} ligne(s)`
  }))
)


function open(sequenceId: string): void {
  void openSequence(props.toolId, props.projectId, sequenceId)
}

/** Suppression sans confirmation : c'est l'annulation qui sert de filet. */
function remove(id: string): void {
  undo.run(deleteSequence(id))
  message.warning('La séquence et son contenu ont été supprimés — Ctrl+Z pour annuler.')
}
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <div class="flex items-center gap-2">
      <BackButton />
      <h1 class="min-w-0 truncate text-xl font-semibold">{{ project?.name ?? 'Projet introuvable' }}</h1>
    </div>
    <p class="mt-1 text-[13px] text-app-muted">
      Les séquences de ce projet. Ouvrez-en une pour éditer ses lignes.
    </p>

    <div class="mt-6">
      <ItemList
        :items="items"
        add-placeholder="Nouvelle séquence — tapez un nom puis Entrée"
        empty-hint="Aucune séquence pour l'instant."
        @open="open"
        @create="(name) => undo.run(createSequence(props.projectId, name))"
        @rename="(id, name) => undo.run(renameSequence(id, name))"
        @remove="remove"
        @reorder="(ids) => undo.run(reorderSequences(props.projectId, ids))"
      />
    </div>
  </div>
</template>
