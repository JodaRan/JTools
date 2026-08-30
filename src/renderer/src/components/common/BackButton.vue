<script setup lang="ts">
/**
 * Retour au niveau supérieur, posé à côté du titre de chaque vue.
 *
 * Il double le fil d'Ariane à dessein : celui-ci demande de viser le bon
 * segment, alors que remonter d'un cran est le geste le plus fréquent.
 * Le raccourci Retour arrière (voir `useAppHotkeys`) fait la même chose.
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { parentRoute } from '@/lib/navigation'
import IconChevronLeft from '~icons/lucide/chevron-left'

const route = useRoute()
const router = useRouter()

const target = computed(() => parentRoute(route))

function goBack(): void {
  const to = target.value
  if (to) void router.push(to)
}
</script>

<template>
  <button
    v-if="target"
    class="-ml-1 shrink-0 rounded p-1.5 text-app-muted transition-colors hover:bg-app-surface-2 hover:text-app-text"
    title="Revenir au niveau supérieur (Retour arrière)"
    data-test="back"
    @click="goBack"
  >
    <IconChevronLeft class="size-5" />
  </button>
</template>
