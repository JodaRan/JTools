<script setup lang="ts">
/**
 * Fil d'Ariane Outils › Projet › Séquence. Chaque segment est cliquable :
 * c'est le chemin de retour rapide vers un ancêtre.
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { toolById } from '@/tools/registry'
import type { RouteLocationRaw } from 'vue-router'
import IconChevron from '~icons/lucide/chevron-right'

const route = useRoute()
const router = useRouter()
const data = useDataStore()

interface Crumb {
  label: string
  to: RouteLocationRaw
}

const crumbs = computed<Crumb[]>(() => {
  const list: Crumb[] = [{ label: 'Outils', to: { name: 'tools' } }]

  const toolId = route.params.toolId as string | undefined
  const projectId = route.params.projectId as string | undefined
  const sequenceId = route.params.sequenceId as string | undefined

  if (toolId) {
    list.push({
      label: toolById(toolId)?.name ?? toolId,
      to: { name: 'projects', params: { toolId } }
    })
  }
  if (toolId && projectId) {
    list.push({
      label: data.project(projectId)?.name ?? 'Projet',
      to: { name: 'sequences', params: { toolId, projectId } }
    })
  }
  if (toolId && projectId && sequenceId) {
    list.push({
      label: data.sequence(sequenceId)?.name ?? 'Séquence',
      to: { name: 'final', params: { toolId, projectId, sequenceId } }
    })
  }
  return list
})
</script>

<template>
  <nav class="flex min-w-0 items-center gap-1 text-[13px]" aria-label="Fil d'Ariane">
    <template v-for="(crumb, index) in crumbs" :key="index">
      <IconChevron v-if="index > 0" class="size-3.5 shrink-0 text-app-muted" />
      <button
        class="max-w-[220px] truncate rounded px-1.5 py-0.5 transition-colors"
        :class="
          index === crumbs.length - 1
            ? 'font-medium text-app-text'
            : 'text-app-muted hover:bg-app-surface-2 hover:text-app-text'
        "
        :aria-current="index === crumbs.length - 1 ? 'page' : undefined"
        :data-test-crumb="crumb.label"
        @click="router.push(crumb.to)"
      >
        {{ crumb.label }}
      </button>
    </template>
  </nav>
</template>
