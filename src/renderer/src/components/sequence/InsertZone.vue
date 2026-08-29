<script setup lang="ts">
/**
 * Interstice cliquable entre deux lignes, façon tableur : invisible au repos,
 * il fait apparaître un filet et un « + » au survol. Il chevauche les lignes
 * voisines (marges négatives) pour rester facile à viser sans creuser d'espace.
 */
import IconPlus from '~icons/lucide/plus'

defineProps<{ index: number }>()
const emit = defineEmits<{ insert: [] }>()
</script>

<template>
  <div class="relative z-10 -my-1 h-2 w-full">
    <button
      class="group/zone absolute inset-x-0 top-0 flex h-2 w-full items-center"
      :title="`Insérer une ligne en position ${index + 1}`"
      :data-test-insert="index"
      @click="emit('insert')"
    >
      <span
        class="grid size-4 shrink-0 place-items-center rounded-full bg-app-accent text-white opacity-0 transition-opacity group-hover/zone:opacity-100"
      >
        <IconPlus class="size-3" />
      </span>
      <span
        class="h-px flex-1 bg-app-accent opacity-0 transition-opacity group-hover/zone:opacity-100"
      ></span>
    </button>
  </div>
</template>
