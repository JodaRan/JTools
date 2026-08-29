<script setup lang="ts">
/**
 * Une ligne de séquence. Toujours éditable en place — pas de bascule
 * lecture/édition, pas de bouton « enregistrer », pas de modale.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NDropdown } from 'naive-ui'
import type { Line } from '@shared/models'
import IconGrip from '~icons/lucide/grip-vertical'
import IconCopy from '~icons/lucide/copy'
import IconCheck from '~icons/lucide/check'
import IconTrash from '~icons/lucide/trash-2'
import IconMore from '~icons/lucide/more-vertical'
import IconMessage from '~icons/lucide/message-square'

const props = defineProps<{ line: Line; index: number; spotlit?: boolean }>()

const emit = defineEmits<{
  register: [id: string, el: HTMLTextAreaElement | null]
  input: [value: string]
  /** Entrée : valider et enchaîner sur une nouvelle ligne. */
  split: []
  /** Retour arrière sur une ligne vide. */
  removeBackward: []
  focusPrevious: []
  focusNext: []
  move: [direction: -1 | 1]
  duplicate: []
  copy: []
  remove: []
  hide: []
  comment: [text: string]
}>()

const textarea = ref<HTMLTextAreaElement | null>(null)
const copied = ref(false)
const editingComment = ref(false)
const commentDraft = ref('')
let copiedTimer: number | undefined

/** Le champ épouse son contenu : pas d'ascenseur interne, pas de hauteur figée. */
function autoGrow(): void {
  const el = textarea.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

onMounted(() => {
  emit('register', props.line.id, textarea.value)
  autoGrow()
})

onBeforeUnmount(() => {
  emit('register', props.line.id, null)
  window.clearTimeout(copiedTimer)
})

watch(() => props.line.content, () => void nextTick(autoGrow))

function onInput(event: Event): void {
  emit('input', (event.target as HTMLTextAreaElement).value)
  autoGrow()
}

function onCopy(): void {
  emit('copy')
  copied.value = true
  window.clearTimeout(copiedTimer)
  copiedTimer = window.setTimeout(() => {
    copied.value = false
  }, 900)
}

/** Ne déplace le focus que si le curseur est déjà au bord du texte. */
function onArrowUp(event: KeyboardEvent): void {
  const el = event.target as HTMLTextAreaElement
  if (el.selectionStart !== 0 || el.selectionEnd !== 0) return
  event.preventDefault()
  emit('focusPrevious')
}

function onArrowDown(event: KeyboardEvent): void {
  const el = event.target as HTMLTextAreaElement
  const end = el.value.length
  if (el.selectionStart !== end || el.selectionEnd !== end) return
  event.preventDefault()
  emit('focusNext')
}

function onBackspace(event: KeyboardEvent): void {
  const el = event.target as HTMLTextAreaElement
  if (el.value !== '') return
  event.preventDefault()
  emit('removeBackward')
}

async function startComment(): Promise<void> {
  commentDraft.value = props.line.comment
  editingComment.value = true
  await nextTick()
}

function commitComment(): void {
  editingComment.value = false
  if (commentDraft.value !== props.line.comment) emit('comment', commentDraft.value)
}

function focusSelf(): void {
  textarea.value?.focus()
  textarea.value?.select()
}

const menuOptions = computed(() => [
  { key: 'edit', label: 'Modifier' },
  {
    key: 'comment',
    label: props.line.comment ? 'Modifier le commentaire' : 'Ajouter un commentaire'
  },
  { key: 'hide', label: 'Cacher' },
  { type: 'divider', key: 'd1' },
  { key: 'duplicate', label: 'Dupliquer' }
])

function onMenu(key: string): void {
  if (key === 'edit') focusSelf()
  if (key === 'comment') void startComment()
  if (key === 'hide') emit('hide')
  if (key === 'duplicate') emit('duplicate')
}

const vFocusOnMount = { mounted: (el: HTMLInputElement) => el.focus() }
</script>

<template>
  <div
    class="group relative flex items-start gap-1 rounded-md border px-1 py-0.5 transition-colors hover:border-app-border hover:bg-app-surface focus-within:border-app-border focus-within:bg-app-surface"
    :class="spotlit ? 'border-app-accent bg-app-surface ring-1 ring-app-accent' : 'border-transparent'"
    :data-test-line="line.id"
    :data-test-spotlit="spotlit ? 'true' : undefined"
  >
    <span
      class="jt-line-handle mt-1.5 cursor-grab p-0.5 text-app-muted opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
      title="Glisser pour réordonner"
    >
      <IconGrip class="size-4" />
    </span>

    <span class="mt-2 w-5 shrink-0 text-right text-[11px] tabular-nums text-app-muted">
      {{ index + 1 }}
    </span>

    <div class="min-w-0 flex-1">
      <textarea
        ref="textarea"
        rows="1"
        spellcheck="false"
        :value="line.content"
        :data-test-input="line.id"
        class="w-full resize-none bg-transparent px-2 py-1.5 font-mono text-[13px] leading-5 text-app-text outline-none"
        @input="onInput"
        @keydown.enter.exact.prevent="emit('split')"
        @keydown.up="onArrowUp"
        @keydown.down="onArrowDown"
        @keydown.backspace="onBackspace"
        @keydown.alt.up.prevent="emit('move', -1)"
        @keydown.alt.down.prevent="emit('move', 1)"
        @keydown.ctrl.d.prevent="emit('duplicate')"
        @keydown.esc="($event.target as HTMLTextAreaElement).blur()"
      ></textarea>

      <input
        v-if="editingComment"
        v-focus-on-mount
        v-model="commentDraft"
        placeholder="Commentaire…"
        class="mb-1 ml-2 w-[calc(100%-0.5rem)] rounded bg-app-surface-2 px-2 py-1 text-[12px] text-app-muted outline-none ring-1 ring-app-accent"
        @keydown.enter.prevent="commitComment"
        @keydown.esc.prevent="editingComment = false"
        @blur="commitComment"
      />
      <p
        v-else-if="line.comment"
        class="mb-1 ml-2 flex items-start gap-1 px-2 text-[12px] text-app-muted"
      >
        <IconMessage class="mt-0.5 size-3 shrink-0" />
        <span class="min-w-0 wrap-break-word">{{ line.comment }}</span>
      </p>
    </div>

    <div class="mt-1 flex shrink-0 items-center gap-0.5">
      <button
        class="rounded p-1.5 transition-colors hover:bg-app-surface-2"
        :class="copied ? 'text-app-accent' : 'text-app-muted opacity-0 group-hover:opacity-100'"
        :title="copied ? 'Copié !' : 'Copier'"
        :data-test-copy="line.id"
        @click="onCopy"
      >
        <component :is="copied ? IconCheck : IconCopy" class="size-4" />
      </button>

      <NDropdown trigger="click" :options="menuOptions" placement="bottom-end" @select="onMenu">
        <button
          class="rounded p-1.5 text-app-muted opacity-0 transition-colors group-hover:opacity-100 hover:bg-app-surface-2 hover:text-app-text focus:opacity-100"
          title="Autres actions"
          :data-test-menu="line.id"
        >
          <IconMore class="size-4" />
        </button>
      </NDropdown>

      <button
        class="rounded p-1.5 text-app-muted opacity-0 transition-colors group-hover:opacity-100 hover:bg-app-surface-2 hover:text-red-500"
        title="Supprimer"
        :data-test-delete="line.id"
        @click="emit('remove')"
      >
        <IconTrash class="size-4" />
      </button>
    </div>
  </div>
</template>
