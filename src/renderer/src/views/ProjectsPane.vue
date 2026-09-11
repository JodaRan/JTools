<script setup lang="ts">
import { computed } from 'vue'
import { useMessage } from 'naive-ui'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useUndoStore } from '@/stores/undo'
import { useLegacyImport } from '@/composables/useLegacyImport'
import { toolById } from '@/tools/registry'
import { createProject, deleteProject, renameProject, reorderProjects } from '@/lib/commands'
import { createDrillType, seedDrillTypes } from '@/lib/drill-commands'
import { useLineSearch } from '@/composables/useLineSearch'
import BackButton from '@/components/common/BackButton.vue'
import ItemList, { type ListItem } from '@/components/common/ItemList.vue'
import SearchField from '@/components/common/SearchField.vue'
import LineResults from '@/components/search/LineResults.vue'
import IconImport from '~icons/lucide/folder-down'
import IconSeed from '~icons/lucide/sparkles'

const props = defineProps<{ toolId: string }>()

const router = useRouter()
const data = useDataStore()
const undo = useUndoStore()
const message = useMessage()
const { importLegacy } = useLegacyImport()

const tool = computed(() => toolById(props.toolId))
const isTasks = computed(() => props.toolId === 'tasks')
const isDrills = computed(() => props.toolId === 'drills')

// L'outil Tâches cherche déjà dans ses cartes, tableau par tableau : une
// seconde recherche ici dirait la même chose deux fois.
const { query, searching } = useLineSearch()

const items = computed<ListItem[]>(() =>
  data.projectsOfTool(props.toolId).map((project) => ({
    id: project.id,
    name: project.name,
    subtitle: `${data.sequencesOfProject(project.id).length} ${tool.value?.sequenceCounted ?? ''}`
  }))
)

function open(projectId: string): void {
  void router.push({ name: 'sequences', params: { toolId: props.toolId, projectId } })
}

/**
 * Un type d'exercice naît avec son guide de prompt et une première partie ;
 * un projet ordinaire n'a ni l'un ni l'autre. Chaque outil crée donc le sien.
 */
function create(name: string): void {
  undo.run(isDrills.value ? createDrillType(props.toolId, name) : createProject(props.toolId, name))
}

/**
 * Les cinq types de départ, en une action annulable. Le bouton ne s'affiche
 * que sur un outil vide : c'est une amorce, pas un bouton de tous les jours.
 */
function seed(): void {
  const command = seedDrillTypes(props.toolId)
  undo.run(command)
  message.success('Types d’exercices créés — ouvrez-en un pour copier son guide de prompt.')
}

/** Suppression sans confirmation : c'est l'annulation qui sert de filet. */
function remove(id: string): void {
  undo.run(deleteProject(id))
  message.warning('Le projet et son contenu ont été supprimés — Ctrl+Z pour annuler.')
}

/**
 * Reprise en masse : on désigne le dossier qui contient les sauvegardes, et
 * chaque sous-dossier devient un projet — ses sprints, des tableaux.
 */
async function importFolder(): Promise<void> {
  const outcome = await importLegacy('folder', props.toolId)
  if (outcome?.firstProjectId) open(outcome.firstProjectId)
}
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <div class="flex items-center gap-2">
      <BackButton />
      <h1 class="min-w-0 flex-1 truncate text-xl font-semibold">
        {{ tool?.name ?? 'Outil inconnu' }}
      </h1>
      <SearchField
        v-if="tool?.searchesLines"
        hotkey
        v-model="query"
        placeholder="Chercher un mot dans toutes les lignes (Ctrl+F)"
        input-class="w-64"
        test-id="lines-search"
      />
      <button
        v-if="isTasks"
        class="flex shrink-0 items-center gap-1.5 rounded-md border border-app-border px-2.5 py-1.5 text-[12px] text-app-muted transition-colors hover:border-app-accent hover:text-app-text"
        title="Reprendre un dossier de sauvegardes de l'ancien gestionnaire de tâches"
        data-test="import-folder"
        @click="importFolder"
      >
        <IconImport class="size-3.5" />
        Reprendre d'anciennes sauvegardes
      </button>
      <button
        v-if="isDrills && items.length === 0"
        class="flex shrink-0 items-center gap-1.5 rounded-md border border-app-border px-2.5 py-1.5 text-[12px] text-app-muted transition-colors hover:border-app-accent hover:text-app-text"
        title="Créer les cinq types d'exercices de départ, avec leurs guides de prompt"
        data-test="seed-drills"
        @click="seed"
      >
        <IconSeed class="size-3.5" />
        Créer les types de départ
      </button>
    </div>
    <p class="mt-1 text-[13px] text-app-muted">{{ tool?.description }}</p>

    <div class="mt-6">
      <LineResults v-if="searching" :tool-id="props.toolId" :query="query" />

      <ItemList
        v-else
        :items="items"
        :add-placeholder="tool?.projectPlaceholder ?? 'Nouveau projet — tapez un nom puis Entrée'"
        :empty-hint="`Aucun ${tool?.projectLabel ?? 'projet'} pour l'instant.`"
        @open="open"
        @create="create"
        @rename="(id, name) => undo.run(renameProject(id, name))"
        @remove="remove"
        @reorder="(ids) => undo.run(reorderProjects(props.toolId, ids))"
      />
    </div>
  </div>
</template>
