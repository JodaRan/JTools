<script setup lang="ts">
/**
 * Vue finale d'input : la liste de lignes d'une séquence.
 *
 * Tout est pensé pour que la saisie ne s'arrête jamais — édition en place,
 * insertion au clavier ou par l'interstice entre deux lignes, ligne fantôme
 * toujours prête en bas. Aucune modale, aucun bouton « enregistrer ».
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { VueDraggable } from 'vue-draggable-plus'
import { useDataStore } from '@/stores/data'
import { useUndoStore } from '@/stores/undo'
import {
  createLine,
  createLines,
  deleteLine,
  pasteIntoLine,
  renameSequence,
  reorderLines,
  setLineComment,
  setLineHidden,
  setLineMasked,
  updateLine
} from '@/lib/commands'
import { useSpotlight } from '@/composables/useSpotlight'
import { isMultiline, pasteSummary, splitPastedText } from '@/lib/paste'
import BackButton from '@/components/common/BackButton.vue'
import LineRow from '@/components/sequence/LineRow.vue'
import InsertZone from '@/components/sequence/InsertZone.vue'
import type { Line } from '@shared/models'
import IconCopyAll from '~icons/lucide/clipboard-list'
import IconPlus from '~icons/lucide/plus'

const props = defineProps<{
  toolId: string
  projectId: string
  sequenceId: string
  /**
   * Rendu dans le volet droit plutôt que par le routeur : le bouton retour
   * agirait sur la route du volet principal, il n'a donc rien à faire ici.
   */
  embedded?: boolean
}>()

const data = useDataStore()
const undo = useUndoStore()
const message = useMessage()
const { spotlightId } = useSpotlight()

const sequence = computed(() => data.sequence(props.sequenceId))
const allLines = computed(() => data.linesOfSequence(props.sequenceId))
const visible = computed(() => allLines.value.filter((line) => !line.hidden))
const hiddenCount = computed(() => allLines.value.length - visible.value.length)
const maskedCount = computed(() => visible.value.filter((line) => line.masked).length)

// Copie locale : Sortable réordonne le tableau qu'on lui confie, on ne veut
// pas qu'il touche directement au store.
const draggable = ref<Line[]>([])
watch(visible, (lines) => (draggable.value = [...lines]), { immediate: true, deep: true })

// —————————————————————————— Focus ——————————————————————————

const inputs = new Map<string, HTMLTextAreaElement>()
const ghost = ref<HTMLTextAreaElement | null>(null)
const ghostValue = ref('')

function register(id: string, el: HTMLTextAreaElement | null): void {
  if (el) inputs.set(id, el)
  else inputs.delete(id)
}

/** Attend le rendu, puis pose le curseur — au bout du texte par défaut. */
async function focusLine(id: string, caret: 'start' | 'end' = 'end'): Promise<void> {
  await nextTick()
  const el = inputs.get(id)
  if (!el) return
  el.focus()
  const position = caret === 'end' ? el.value.length : 0
  el.setSelectionRange(position, position)
}

async function focusGhost(): Promise<void> {
  await nextTick()
  ghost.value?.focus()
}

// ————————————————————— Positions dans la liste —————————————————————

/** Les lignes cachées comptent dans l'ordre réel : on convertit les index. */
const fullIndexOf = (id: string): number => allLines.value.findIndex((line) => line.id === id)

function insertAt(index: number, content = ''): void {
  const command = createLine(props.sequenceId, content, index)
  undo.run(command)
  void focusLine(command.entityId)
}

// ————————————————————————— Actions de ligne —————————————————————————

const onInput = (line: Line, value: string): void => undo.run(updateLine(line.id, value))

/** Entrée : on valide et on enchaîne immédiatement sur une nouvelle ligne. */
const onSplit = (line: Line): void => insertAt(fullIndexOf(line.id) + 1)

function onRemoveBackward(line: Line, position: number): void {
  undo.run(deleteLine(line.id))
  const previous = visible.value[position - 1]
  if (previous) void focusLine(previous.id)
  else void focusGhost()
}

function onFocusPrevious(position: number): void {
  const previous = visible.value[position - 1]
  if (previous) void focusLine(previous.id)
}

function onFocusNext(position: number): void {
  const next = visible.value[position + 1]
  if (next) void focusLine(next.id)
  else void focusGhost()
}

/** Équivalent clavier du glisser-déposer. */
function onMove(line: Line, direction: -1 | 1): void {
  const order = allLines.value.map((item) => item.id)
  const from = order.indexOf(line.id)
  const to = from + direction
  if (to < 0 || to >= order.length) return
  order.splice(to, 0, ...order.splice(from, 1))
  undo.run(reorderLines(props.sequenceId, order))
  void focusLine(line.id)
}

function onDuplicate(line: Line): void {
  insertAt(fullIndexOf(line.id) + 1, line.content)
}

function onCopy(line: Line): void {
  window.jtools.clipboard.write(line.content)
}

function onRemove(line: Line, position: number): void {
  undo.run(deleteLine(line.id))
  const next = visible.value[position] ?? visible.value[position - 1]
  if (next) void focusLine(next.id)
}

function onHide(line: Line): void {
  undo.run(setLineHidden(line.id, true))
  message.info('Ligne cachée — visible dans le panneau latéral.')
}

function onMask(line: Line, masked: boolean): void {
  undo.run(setLineMasked(line.id, masked))
  message.info(masked ? 'Contenu masqué — cliquez sur l’œil pour le révéler.' : 'Ligne démasquée.')
}

const onComment = (line: Line, text: string): void => undo.run(setLineComment(line.id, text))

/**
 * Collage multi-ligne au milieu d'une ligne. Le comportement est celui d'un
 * éditeur de texte : la ligne se coupe au curseur et les morceaux collés
 * s'intercalent — le tout en une seule action annulable.
 */
function onPasteLines(
  line: Line,
  payload: { text: string; before: string; after: string }
): void {
  const split = splitPastedText(payload.text)
  if (split.lines.length === 0) return

  const command = pasteIntoLine(line.id, payload.before, payload.after, split.lines)
  undo.run(command)
  message.success(pasteSummary(split))
  void focusLine(command.entityIds.at(-1)!)
}

// —————————————————————————— Ligne fantôme ——————————————————————————

/**
 * Le texte reste dans la fantôme jusqu'à validation : le focus ne saute pas,
 * on peut enchaîner « texte, Entrée, texte, Entrée » sans jamais s'arrêter.
 */
function commitGhost(): void {
  const content = ghostValue.value
  if (!content.trim()) {
    ghostValue.value = ''
    return
  }
  // La séquence a pu disparaître sous nos pieds : typiquement un Ctrl+Z qui
  // annule sa création pendant qu'on tapait encore. Le démontage de la vue
  // fait perdre le focus au champ, donc passe ici. Valider malgré tout
  // créerait une ligne orpheline — et cette commande de trop viderait la pile
  // de rétablissement, rendant l'annulation irréversible.
  if (!data.sequence(props.sequenceId)) {
    ghostValue.value = ''
    return
  }
  undo.run(createLine(props.sequenceId, content))
  ghostValue.value = ''
  if (ghost.value) ghost.value.style.height = 'auto'
}

function onGhostEnter(): void {
  commitGhost()
  void focusGhost()
}

/**
 * Collage dans la fantôme — le cas courant : on copie un bloc depuis un fichier
 * et on le dépose en bas de la séquence. Ce qui était déjà tapé dans la
 * fantôme se raccroche à la première ligne collée.
 */
function onGhostPaste(event: ClipboardEvent): void {
  const text = event.clipboardData?.getData('text/plain') ?? ''
  if (!isMultiline(text)) return

  event.preventDefault()
  const el = event.target as HTMLTextAreaElement
  const split = splitPastedText(el.value.slice(0, el.selectionStart) + text)
  const trailing = el.value.slice(el.selectionEnd)
  if (split.lines.length === 0) return

  if (trailing) split.lines[split.lines.length - 1] += trailing

  undo.run(createLines(props.sequenceId, split.lines))
  message.success(pasteSummary(split))

  ghostValue.value = ''
  if (ghost.value) ghost.value.style.height = 'auto'
  void focusGhost()
}

/**
 * Ctrl+Z dans la ligne fantôme.
 *
 * Tant qu'il reste du texte non validé, on laisse le champ faire son
 * annulation native — c'est le réflexe qu'on a d'un éditeur de texte : « ce
 * que je viens de taper est faux, j'annule ». Le raccourci global ne doit pas
 * passer devant et remonter jusqu'à la création de la séquence.
 *
 * Champ vide, on ne bloque plus rien : l'annulation applicative reprend la
 * main, et l'on remonte alors dans l'historique des actions.
 */
function onGhostUndo(event: KeyboardEvent): void {
  if (ghostValue.value === '') return
  // Sans `preventDefault` : c'est justement l'action par défaut qu'on veut.
  event.stopPropagation()
}

function onGhostBackspace(event: KeyboardEvent): void {
  if (ghostValue.value !== '') return
  const last = visible.value.at(-1)
  if (!last) return
  event.preventDefault()
  void focusLine(last.id)
}

function growGhost(event: Event): void {
  const el = event.target as HTMLTextAreaElement
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

// ————————————————————————— En-tête de séquence —————————————————————————

function onRename(event: Event): void {
  const name = (event.target as HTMLInputElement).value.trim()
  if (!name || name === sequence.value?.name) return
  undo.run(renameSequence(props.sequenceId, name))
}

function copyAll(): void {
  const text = visible.value.map((line) => line.content).join('\n')
  window.jtools.clipboard.write(text)
  message.success(`${visible.value.length} ligne(s) copiée(s).`)
}

// ————————————————————————— Glisser-déposer —————————————————————————

/** Réordonne les lignes visibles en laissant les cachées à leur place. */
function onDragEnd(): void {
  const moved = draggable.value.map((line) => line.id)
  let cursor = 0
  const order = allLines.value.map((line) => (line.hidden ? line.id : moved[cursor++]))
  undo.run(reorderLines(props.sequenceId, order))
}
</script>

<template>
  <div v-if="sequence" class="mx-auto max-w-3xl">
    <header class="mb-4 flex items-center gap-2">
      <BackButton v-if="!embedded" />
      <input
        :value="sequence.name"
        class="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-xl font-semibold text-app-text outline-none hover:bg-app-surface focus:bg-app-surface-2"
        data-test="sequence-name"
        @change="onRename"
        @keydown.enter="($event.target as HTMLInputElement).blur()"
      />
      <span class="shrink-0 text-[12px] text-app-muted">
        {{ visible.length }} ligne(s)<template v-if="maskedCount">
          · {{ maskedCount }} masquée(s)</template
        ><template v-if="hiddenCount"> · {{ hiddenCount }} cachée(s)</template>
      </span>
      <button
        class="shrink-0 rounded p-1.5 text-app-muted transition-colors hover:bg-app-surface-2 hover:text-app-text"
        title="Copier toute la séquence"
        data-test="copy-all"
        @click="copyAll"
      >
        <IconCopyAll class="size-4" />
      </button>
    </header>

    <VueDraggable
      v-model="draggable"
      :animation="150"
      handle=".jt-line-handle"
      ghost-class="opacity-40"
      class="flex flex-col"
      @end="onDragEnd"
    >
      <div v-for="(line, position) in draggable" :key="line.id">
        <InsertZone :index="position" @insert="insertAt(fullIndexOf(line.id))" />
        <LineRow
          :line="line"
          :index="position"
          :spotlit="spotlightId === line.id"
          @register="register"
          @input="(value) => onInput(line, value)"
          @split="onSplit(line)"
          @remove-backward="onRemoveBackward(line, position)"
          @focus-previous="onFocusPrevious(position)"
          @focus-next="onFocusNext(position)"
          @move="(direction) => onMove(line, direction)"
          @duplicate="onDuplicate(line)"
          @copy="onCopy(line)"
          @remove="onRemove(line, position)"
          @hide="onHide(line)"
          @mask="(masked) => onMask(line, masked)"
          @paste-lines="(payload) => onPasteLines(line, payload)"
          @comment="(text) => onComment(line, text)"
        />
      </div>
    </VueDraggable>

    <!-- Ligne fantôme : toujours là, prête à recevoir la frappe suivante. -->
    <div
      class="mt-1 flex items-start gap-1 rounded-md border border-transparent px-1 py-0.5 focus-within:border-app-border focus-within:bg-app-surface"
    >
      <span class="mt-1.5 p-0.5 text-app-muted"><IconPlus class="size-4" /></span>
      <span class="mt-2 w-5 shrink-0 text-right text-[11px] tabular-nums text-app-muted">
        {{ visible.length + 1 }}
      </span>
      <textarea
        ref="ghost"
        v-model="ghostValue"
        rows="1"
        spellcheck="false"
        placeholder="Ajouter une ligne — Entrée pour valider"
        data-test="ghost-input"
        class="min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 font-mono text-[13px] leading-5 text-app-text outline-none placeholder:font-sans placeholder:text-app-muted"
        @input="growGhost"
        @paste="onGhostPaste"
        @keydown.ctrl.z.exact="onGhostUndo"
        @keydown.enter.exact.prevent="onGhostEnter"
        @keydown.backspace="onGhostBackspace"
        @blur="commitGhost"
      ></textarea>
    </div>
  </div>

  <p v-else class="text-app-muted">Cette séquence n'existe plus.</p>
</template>
