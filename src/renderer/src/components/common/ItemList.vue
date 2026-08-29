<script setup lang="ts">
/**
 * Liste réordonnable de projets ou de séquences. Même grammaire que la vue
 * finale : renommage sur place, ligne fantôme en fin de liste, poignée de
 * glissement, menu ⋮ — aucune boîte de dialogue.
 */
import { ref, watch } from 'vue'
import { NDropdown } from 'naive-ui'
import { VueDraggable } from 'vue-draggable-plus'
import IconGrip from '~icons/lucide/grip-vertical'
import IconMore from '~icons/lucide/more-vertical'
import IconChevron from '~icons/lucide/chevron-right'
import IconPlus from '~icons/lucide/plus'

export interface ListItem {
  id: string
  name: string
  subtitle?: string
}

const props = defineProps<{
  items: ListItem[]
  addPlaceholder: string
  emptyHint: string
}>()

const emit = defineEmits<{
  open: [id: string]
  create: [name: string]
  rename: [id: string, name: string]
  remove: [id: string]
  reorder: [ids: string[]]
}>()

// Copie locale : Sortable réordonne le tableau qu'on lui confie, on ne veut
// pas qu'il touche directement au store.
const local = ref<ListItem[]>([])
watch(
  () => props.items,
  (items) => {
    local.value = items.map((item) => ({ ...item }))
  },
  { immediate: true, deep: true }
)

const editingId = ref<string | null>(null)
const draft = ref('')
const newName = ref('')

// Une `ref` posée dans un v-for devient un tableau ; une directive cible
// directement l'élément qui vient d'apparaître.
const vSelectOnMount = {
  mounted: (el: HTMLInputElement) => el.select()
}

function startRename(item: ListItem): void {
  editingId.value = item.id
  draft.value = item.name
}

function commitRename(): void {
  const id = editingId.value
  if (!id) return
  const name = draft.value.trim()
  const previous = props.items.find((item) => item.id === id)?.name
  editingId.value = null
  if (name && name !== previous) emit('rename', id, name)
}

function cancelRename(): void {
  editingId.value = null
}

function commitCreate(): void {
  const name = newName.value.trim()
  if (!name) return
  emit('create', name)
  // On garde le focus : enchaîner plusieurs créations doit être immédiat.
  newName.value = ''
}

const menuOptions = [
  { key: 'rename', label: 'Renommer' },
  { key: 'remove', label: 'Supprimer' }
]

function onMenu(key: string, item: ListItem): void {
  if (key === 'rename') startRename(item)
  if (key === 'remove') emit('remove', item.id)
}

const onDragEnd = (): void => emit('reorder', local.value.map((item) => item.id))
</script>

<template>
  <div>
    <p v-if="items.length === 0" class="mb-2 text-[13px] text-app-muted">{{ emptyHint }}</p>

    <VueDraggable
      v-model="local"
      :animation="150"
      handle=".jt-handle"
      ghost-class="opacity-40"
      class="flex flex-col"
      @end="onDragEnd"
    >
      <div
        v-for="item in local"
        :key="item.id"
        class="group flex items-center gap-1 rounded-md border border-transparent px-1 py-0.5 hover:border-app-border hover:bg-app-surface"
      >
        <span
          class="jt-handle cursor-grab p-1 text-app-muted opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
          title="Glisser pour réordonner"
        >
          <IconGrip class="size-4" />
        </span>

        <input
          v-if="editingId === item.id"
          v-select-on-mount
          v-model="draft"
          class="min-w-0 flex-1 rounded bg-app-surface-2 px-2 py-1.5 text-[14px] outline-none ring-1 ring-app-accent"
          @keydown.enter.prevent="commitRename"
          @keydown.esc.prevent="cancelRename"
          @blur="commitRename"
        />
        <button
          v-else
          class="flex min-w-0 flex-1 items-center gap-2 px-1 py-1.5 text-left text-[14px]"
          :data-test-item="item.name"
          @click="emit('open', item.id)"
        >
          <span class="truncate">{{ item.name }}</span>
          <span v-if="item.subtitle" class="shrink-0 text-[12px] text-app-muted">
            {{ item.subtitle }}
          </span>
          <IconChevron class="ml-auto size-4 shrink-0 text-app-muted" />
        </button>

        <NDropdown
          trigger="click"
          :options="menuOptions"
          placement="bottom-end"
          @select="(key: string) => onMenu(key, item)"
        >
          <button
            class="rounded p-1 text-app-muted opacity-0 transition-opacity group-hover:opacity-100 hover:bg-app-surface-2 hover:text-app-text focus:opacity-100"
            :title="`Actions sur ${item.name}`"
          >
            <IconMore class="size-4" />
          </button>
        </NDropdown>
      </div>
    </VueDraggable>

    <!-- Ligne fantôme : toujours prête, aucune étape avant de saisir. -->
    <div class="mt-1 flex items-center gap-1 px-1">
      <span class="p-1 text-app-muted"><IconPlus class="size-4" /></span>
      <input
        v-model="newName"
        :placeholder="addPlaceholder"
        data-test="add-input"
        class="min-w-0 flex-1 rounded bg-transparent px-2 py-1.5 text-[14px] text-app-text outline-none placeholder:text-app-muted focus:bg-app-surface-2"
        @keydown.enter.prevent="commitCreate"
      />
    </div>
  </div>
</template>
