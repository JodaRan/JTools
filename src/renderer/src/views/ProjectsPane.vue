<script setup lang="ts">
import { computed } from 'vue'
import { useMessage } from 'naive-ui'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useUndoStore } from '@/stores/undo'
import { toolById } from '@/tools/registry'
import { createProject, deleteProject, renameProject, reorderProjects } from '@/lib/commands'
import ItemList, { type ListItem } from '@/components/common/ItemList.vue'

const props = defineProps<{ toolId: string }>()

const router = useRouter()
const data = useDataStore()
const undo = useUndoStore()
const message = useMessage()

const tool = computed(() => toolById(props.toolId))

const items = computed<ListItem[]>(() =>
  data.projectsOfTool(props.toolId).map((project) => ({
    id: project.id,
    name: project.name,
    subtitle: `${data.sequencesOfProject(project.id).length} séquence(s)`
  }))
)


function open(projectId: string): void {
  void router.push({ name: 'sequences', params: { toolId: props.toolId, projectId } })
}

/** Suppression sans confirmation : c'est l'annulation qui sert de filet. */
function remove(id: string): void {
  undo.run(deleteProject(id))
  message.warning('Le projet et son contenu ont été supprimés — Ctrl+Z pour annuler.')
}
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <h1 class="text-xl font-semibold">{{ tool?.name ?? 'Outil inconnu' }}</h1>
    <p class="mt-1 text-[13px] text-app-muted">{{ tool?.description }}</p>

    <div class="mt-6">
      <ItemList
        :items="items"
        add-placeholder="Nouveau projet — tapez un nom puis Entrée"
        empty-hint="Aucun projet pour l'instant."
        @open="open"
        @create="(name) => undo.run(createProject(props.toolId, name))"
        @rename="(id, name) => undo.run(renameProject(id, name))"
        @remove="remove"
        @reorder="(ids) => undo.run(reorderProjects(props.toolId, ids))"
      />
    </div>
  </div>
</template>
