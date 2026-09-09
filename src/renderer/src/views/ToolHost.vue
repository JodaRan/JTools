<script setup lang="ts">
/**
 * Aiguillage de la vue finale.
 *
 * La route ne connaît qu'un chemin — outil › projet › séquence — et c'est
 * l'outil qui décide de ce qu'on affiche au bout : une liste de lignes, un
 * tableau kanban, ou ce qu'apportera le prochain. Le volet droit passe par le
 * même composant, sinon la vue côte à côte ne saurait afficher qu'un outil.
 */
import { computed } from 'vue'
import { toolById } from '@/tools/registry'

const props = defineProps<{
  toolId: string
  projectId: string
  sequenceId: string
  embedded?: boolean
}>()

const tool = computed(() => toolById(props.toolId))
</script>

<template>
  <component
    :is="tool.view"
    v-if="tool"
    :key="props.sequenceId"
    :tool-id="props.toolId"
    :project-id="props.projectId"
    :sequence-id="props.sequenceId"
    :embedded="props.embedded"
  />
  <p v-else class="text-app-muted">Cet outil n'existe plus.</p>
</template>
