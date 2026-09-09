<script setup lang="ts">
/**
 * Choix de l'acteur. La liste du tableau se complète en tapant : un nom
 * inconnu se crée depuis le même champ que celui qui filtre, sans passer par
 * un écran de réglages.
 */
import { computed, nextTick, ref } from 'vue'
import { UNASSIGNED } from '@shared/models'
import IconCheck from '~icons/lucide/check'
import IconPlus from '~icons/lucide/plus'
import IconUser from '~icons/lucide/user'

const props = defineProps<{ value: string; assignees: string[] }>()
const emit = defineEmits<{ select: [name: string]; add: [name: string] }>()

const open = ref(false)
const query = ref('')
const field = ref<HTMLInputElement | null>(null)

const matches = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return props.assignees.filter((name) => name.toLowerCase().includes(needle))
})

/** Un nom tapé qui n'existe pas encore devient une proposition de création. */
const creatable = computed(() => {
  const name = query.value.trim()
  if (!name) return ''
  return props.assignees.some((item) => item.toLowerCase() === name.toLowerCase()) ? '' : name
})

async function toggle(): Promise<void> {
  open.value = !open.value
  query.value = ''
  if (open.value) {
    await nextTick()
    field.value?.focus()
  }
}

function choose(name: string): void {
  emit('select', name)
  open.value = false
}

function create(): void {
  if (!creatable.value) return
  emit('add', creatable.value)
  emit('select', creatable.value)
  open.value = false
}

/** Entrée prend la première correspondance, sinon crée le nom tapé. */
function onEnter(): void {
  if (matches.value.length > 0) choose(matches.value[0])
  else create()
}
</script>

<template>
  <div class="relative">
    <button
      class="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[13px] transition-colors hover:bg-app-surface-2"
      :class="props.value === UNASSIGNED && 'text-app-muted'"
      data-test="assignee-picker"
      @click="toggle"
    >
      <IconUser class="size-3.5 shrink-0 text-app-muted" />
      <span class="min-w-0 flex-1 truncate">{{ props.value }}</span>
    </button>

    <div
      v-if="open"
      class="absolute left-0 top-8 z-30 w-56 overflow-hidden rounded-md border border-app-border bg-app-bg shadow-lg"
    >
      <input
        ref="field"
        v-model="query"
        placeholder="Chercher ou ajouter…"
        class="w-full border-b border-app-border bg-transparent px-2.5 py-2 text-[13px] outline-none placeholder:text-app-muted"
        @keydown.enter.prevent="onEnter"
        @keydown.esc="open = false"
      />
      <div class="max-h-56 overflow-y-auto py-1">
        <button
          v-for="name in matches"
          :key="name"
          class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] hover:bg-app-surface-2"
          @click="choose(name)"
        >
          <IconCheck
            class="size-3.5 shrink-0"
            :class="name === props.value ? 'text-app-accent' : 'opacity-0'"
          />
          <span class="min-w-0 truncate">{{ name }}</span>
        </button>

        <button
          v-if="creatable"
          class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] text-app-accent hover:bg-app-surface-2"
          @click="create"
        >
          <IconPlus class="size-3.5 shrink-0" />
          <span class="min-w-0 truncate">Ajouter « {{ creatable }} »</span>
        </button>
      </div>
    </div>

    <!-- Fermeture au clic ailleurs, sans capturer le reste de l'application. -->
    <div v-if="open" class="fixed inset-0 z-20" @click="open = false"></div>
  </div>
</template>
