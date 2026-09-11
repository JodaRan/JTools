<script setup lang="ts">
/**
 * Champ de recherche du chrome. Une seule forme pour toute l'app : le tableau
 * de tâches et les listes de l'explorateur doivent se chercher du même geste.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { registerHotkeys } from '@/lib/hotkeys'
import IconSearch from '~icons/lucide/search'
import IconClear from '~icons/lucide/x'

const model = defineModel<string>({ required: true })

const props = withDefaults(
  defineProps<{
    placeholder?: string
    testId?: string
    /** Largeur du champ : étroite dans un en-tête, large dans une liste. */
    inputClass?: string
    /**
     * Laisse ce champ répondre à Ctrl+F. À n'activer que sur un seul champ à
     * la fois : le volet de droite a le sien, et deux se disputeraient la touche.
     */
    hotkey?: boolean
  }>(),
  { placeholder: 'Rechercher', testId: undefined, inputClass: 'w-32', hotkey: false }
)

const input = ref<HTMLInputElement | null>(null)

const focus = (): void => input.value?.focus()

let dispose: (() => void) | undefined

onMounted(() => {
  if (!props.hotkey) return
  // `inFields` : on cherche souvent depuis la ligne de création, le curseur
  // est donc déjà dans un champ quand le réflexe arrive.
  dispose = registerHotkeys([{ key: 'f', ctrl: true, inFields: true, run: focus }])
})

onBeforeUnmount(() => dispose?.())

defineExpose({ focus })
</script>

<template>
  <label
    class="flex shrink-0 items-center gap-1.5 rounded-md border border-app-border px-2 py-1 focus-within:border-app-accent"
  >
    <IconSearch class="size-3.5 shrink-0 text-app-muted" />
    <input
      ref="input"
      v-model="model"
      spellcheck="false"
      :placeholder="placeholder"
      :data-test="testId"
      :class="inputClass"
      class="bg-transparent text-[12px] text-app-text outline-none placeholder:text-app-muted"
      @keydown.esc.prevent="model = ''"
    />
    <button
      v-if="model"
      class="shrink-0 rounded p-0.5 text-app-muted transition-colors hover:bg-app-surface-2 hover:text-app-text"
      title="Effacer la recherche (Échap)"
      type="button"
      @click="model = ''"
    >
      <IconClear class="size-3" />
    </button>
  </label>
</template>
