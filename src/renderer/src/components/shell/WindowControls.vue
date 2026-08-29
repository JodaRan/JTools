<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import IconMinus from '~icons/lucide/minus'
import IconSquare from '~icons/lucide/square'
import IconRestore from '~icons/lucide/copy'
import IconClose from '~icons/lucide/x'

const maximized = ref(false)
let stopListening: (() => void) | undefined

// `window` n'est pas accessible depuis un template Vue : on passe par des
// fonctions locales.
const minimize = (): void => window.jtools.window.minimize()
const toggleMaximize = (): void => window.jtools.window.toggleMaximize()
const close = (): void => window.jtools.window.close()

onMounted(async () => {
  maximized.value = await window.jtools.window.isMaximized()
  stopListening = window.jtools.window.onMaximizedChange((value) => {
    maximized.value = value
  })
})

onUnmounted(() => stopListening?.())
</script>

<template>
  <div class="app-no-drag flex h-full items-stretch">
    <button
      class="flex w-[46px] items-center justify-center text-app-text transition-colors hover:bg-app-surface-2"
      title="Réduire"
      @click="minimize"
    >
      <IconMinus class="size-4" />
    </button>
    <button
      class="flex w-[46px] items-center justify-center text-app-text transition-colors hover:bg-app-surface-2"
      :title="maximized ? 'Restaurer' : 'Agrandir'"
      @click="toggleMaximize"
    >
      <component :is="maximized ? IconRestore : IconSquare" class="size-3.5" />
    </button>
    <button
      class="flex w-[46px] items-center justify-center text-app-text transition-colors hover:bg-[#c42b1c] hover:text-white"
      title="Fermer"
      @click="close"
    >
      <IconClose class="size-4" />
    </button>
  </div>
</template>
