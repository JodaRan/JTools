<script setup lang="ts">
import { useRouter } from 'vue-router'
import { tools } from '@/tools/registry'
import { useDataStore } from '@/stores/data'

const router = useRouter()
const data = useDataStore()

function open(toolId: string): void {
  void router.push({ name: 'projects', params: { toolId } })
}
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <h1 class="text-xl font-semibold">Outils</h1>
    <p class="mt-1 text-[13px] text-app-muted">Choisissez un outil pour commencer.</p>

    <div class="mt-6 grid gap-3 sm:grid-cols-2">
      <button
        v-for="tool in tools"
        :key="tool.id"
        class="flex items-start gap-3 rounded-lg border border-app-border bg-app-surface p-4 text-left transition-colors hover:border-app-accent"
        :data-test-tool="tool.id"
        @click="open(tool.id)"
      >
        <span class="mt-0.5 rounded-md bg-app-surface-2 p-2 text-app-accent">
          <component :is="tool.icon" class="size-5" />
        </span>
        <span class="min-w-0">
          <span class="block text-[14px] font-medium">{{ tool.name }}</span>
          <span class="mt-0.5 block text-[13px] text-app-muted">{{ tool.description }}</span>
          <span class="mt-2 block text-[12px] text-app-muted">
            {{ data.projectsOfTool(tool.id).length }} projet(s)
          </span>
        </span>
      </button>
    </div>
  </div>
</template>
