<script setup lang="ts">
/**
 * Panneau latéral droit : l'historique des modifications, les lignes cachées,
 * et ce que les autres outils ont à y poser — le guide de prompt, la leçon et
 * les séries archivées de l'outil « Exercices ». Chaque outil déclare les
 * panneaux qui ont un sens chez lui : un onglet vide serait une promesse en
 * l'air.
 */
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useMessage } from 'naive-ui'
import { useUiStore } from '@/stores/ui'
import { useDataStore } from '@/stores/data'
import { useHistoryStore } from '@/stores/history'
import { useUndoStore } from '@/stores/undo'
import { useSpotlight } from '@/composables/useSpotlight'
import { MASK, createLine, setLineHidden, setLineMasked } from '@/lib/commands'
import GuidePanel from '@/components/drill/GuidePanel.vue'
import LessonPanel from '@/components/drill/LessonPanel.vue'
import RunsPanel from '@/components/drill/RunsPanel.vue'
import type { HistoryEntry, Line, SidebarPanel } from '@shared/models'
import IconClose from '~icons/lucide/x'
import IconEye from '~icons/lucide/eye'
import IconCopy from '~icons/lucide/copy'
import IconEyeOff from '~icons/lucide/eye-off'
import IconUndoDot from '~icons/lucide/rotate-ccw'

const ui = useUiStore()
const data = useDataStore()
const history = useHistoryStore()
const undo = useUndoStore()
const route = useRoute()
const message = useMessage()
const { spot } = useSpotlight()

const sequenceId = computed(() => (route.params.sequenceId as string | undefined) ?? null)
const projectId = computed(() => (route.params.projectId as string | undefined) ?? null)
const toolId = computed(() => (route.params.toolId as string | undefined) ?? null)

const hidden = computed<Line[]>(() =>
  sequenceId.value ? data.hiddenLines(sequenceId.value) : []
)

const masked = computed<Line[]>(() =>
  sequenceId.value ? data.maskedLines(sequenceId.value) : []
)

/**
 * Révélations en cours dans le panneau. Comme dans la liste, c'est un état de
 * vue : changer de séquence les referme toutes.
 */
const revealed = ref(new Set<string>())
watch(sequenceId, () => revealed.value.clear())

function toggleReveal(id: string): void {
  const next = new Set(revealed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  revealed.value = next
}

/** Ce qu'on affiche pour une ligne : son texte, ou des points. */
const display = (line: Line): string => {
  if (line.masked && !revealed.value.has(line.id)) return MASK
  return line.content || '(vide)'
}

function unmask(line: Line): void {
  undo.run(setLineMasked(line.id, false))
  void spot(line.id)
}

/** Sur une vue finale on filtre sur la séquence ; ailleurs on montre tout. */
const entries = computed<HistoryEntry[]>(() =>
  sequenceId.value ? history.forSequence(sequenceId.value) : history.recent
)

const timeOf = (iso: string): string =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

/** Seules les suppressions de lignes portent de quoi être ressuscitées. */
const isRestorable = (entry: HistoryEntry): boolean =>
  entry.action === 'delete' &&
  entry.entityType === 'line' &&
  entry.before !== null &&
  data.line(entry.entityId) === undefined

function restore(entry: HistoryEntry): void {
  const line = entry.before as Line
  const command = createLine(line.sequenceId, line.content, line.order)
  undo.run(command)
  void spot(command.entityId)
  message.success('Ligne restaurée.')
}

function unhide(line: Line): void {
  undo.run(setLineHidden(line.id, false))
  void spot(line.id)
}

function copy(line: Line): void {
  window.jtools.clipboard.write(line.content)
  message.success('Copié.')
}

const PANEL_LABELS: Record<SidebarPanel, string> = {
  history: 'Historique',
  hidden: 'Cachées',
  masked: 'Masquées',
  guide: 'Guide',
  lesson: 'Leçon',
  runs: 'Séries'
}

/**
 * Cacher et masquer sont des notions de séquence ; la leçon et les séries,
 * des notions de partie d'exercices. Chaque outil n'affiche donc que ce qu'il
 * sait remplir, et l'historique reste partout.
 */
const panels = computed<{ key: SidebarPanel; label: string }[]>(() => {
  const keys: SidebarPanel[] =
    toolId.value === 'tasks'
      ? ['history']
      : toolId.value === 'drills'
        ? sequenceId.value
          ? ['history', 'guide', 'lesson', 'runs']
          : ['history', 'guide']
        : ['history', 'hidden', 'masked']
  return keys.map((key) => ({ key, label: PANEL_LABELS[key] }))
})

watch(panels, (list) => {
  if (!list.some((panel) => panel.key === ui.sidebar.panel)) ui.setSidebar(true, 'history')
})
</script>

<template>
  <aside
    v-if="ui.sidebar.open"
    class="flex shrink-0 flex-col border-l border-app-border bg-app-surface"
    :style="{ width: `${ui.sidebar.width}px` }"
    data-test="sidebar"
  >
    <div class="flex items-center gap-1 border-b border-app-border px-2 py-1.5">
      <button
        v-for="panel in panels"
        :key="panel.key"
        class="rounded px-2 py-1 text-[12px] transition-colors"
        :class="
          ui.sidebar.panel === panel.key
            ? 'bg-app-surface-2 text-app-text'
            : 'text-app-muted hover:text-app-text'
        "
        :data-test-panel="panel.key"
        @click="ui.setSidebar(true, panel.key)"
      >
        {{ panel.label }}
        <span v-if="panel.key === 'hidden' && hidden.length" class="ml-1 text-app-accent">
          {{ hidden.length }}
        </span>
        <span v-if="panel.key === 'masked' && masked.length" class="ml-1 text-app-accent">
          {{ masked.length }}
        </span>
      </button>
      <button
        class="ml-auto rounded p-1 text-app-muted transition-colors hover:bg-app-surface-2 hover:text-app-text"
        title="Fermer le panneau"
        @click="ui.setSidebar(false)"
      >
        <IconClose class="size-4" />
      </button>
    </div>

    <!-- Historique -->
    <div v-if="ui.sidebar.panel === 'history'" class="min-h-0 flex-1 overflow-auto p-2">
      <p v-if="entries.length === 0" class="p-2 text-[12px] text-app-muted">
        Aucune modification enregistrée.
      </p>
      <ul class="flex flex-col gap-0.5">
        <li
          v-for="entry in entries"
          :key="entry.id"
          class="group flex items-start gap-2 rounded px-2 py-1.5 hover:bg-app-surface-2"
        >
          <span class="mt-0.5 shrink-0 text-[11px] tabular-nums text-app-muted">
            {{ timeOf(entry.at) }}
          </span>
          <span class="min-w-0 flex-1 text-[12px] wrap-break-word">{{ entry.label }}</span>
          <button
            v-if="isRestorable(entry)"
            class="shrink-0 rounded p-1 text-app-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-app-accent"
            title="Restaurer cette ligne"
            data-test="restore"
            @click="restore(entry)"
          >
            <IconUndoDot class="size-3.5" />
          </button>
        </li>
      </ul>
    </div>

    <!-- Lignes cachées : retirées de la liste, elles ne vivent plus qu'ici -->
    <div v-else-if="ui.sidebar.panel === 'hidden'" class="min-h-0 flex-1 overflow-auto p-2">
      <p v-if="!sequenceId" class="p-2 text-[12px] text-app-muted">
        Ouvrez une séquence pour voir ses lignes cachées.
      </p>
      <p v-else-if="hidden.length === 0" class="p-2 text-[12px] text-app-muted">
        Aucune ligne cachée dans cette séquence.
      </p>
      <ul class="flex flex-col gap-0.5">
        <li
          v-for="line in hidden"
          :key="line.id"
          class="group flex items-start gap-1 rounded px-2 py-1.5 hover:bg-app-surface-2"
          :data-test-hidden="line.id"
        >
          <span class="min-w-0 flex-1 font-mono text-[12px] wrap-break-word text-app-muted">
            {{ display(line) }}
          </span>
          <button
            class="shrink-0 rounded p-1 text-app-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-app-text"
            title="Copier"
            @click="copy(line)"
          >
            <IconCopy class="size-3.5" />
          </button>
          <button
            class="shrink-0 rounded p-1 text-app-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-app-accent"
            title="Réafficher"
            :data-test-unhide="line.id"
            @click="unhide(line)"
          >
            <IconEye class="size-3.5" />
          </button>
        </li>
      </ul>
    </div>

    <!-- Lignes masquées : l'inventaire des secrets de la séquence. On peut les
         copier sans jamais les afficher. -->
    <div
      v-else-if="ui.sidebar.panel === 'masked'"
      class="min-h-0 flex-1 overflow-auto p-2"
    >
      <p v-if="!sequenceId" class="p-2 text-[12px] text-app-muted">
        Ouvrez une séquence pour voir ses lignes masquées.
      </p>
      <p v-else-if="masked.length === 0" class="p-2 text-[12px] text-app-muted">
        Aucune ligne masquée dans cette séquence.
      </p>
      <ul class="flex flex-col gap-0.5">
        <li
          v-for="line in masked"
          :key="line.id"
          class="group flex items-start gap-1 rounded px-2 py-1.5 hover:bg-app-surface-2"
          :data-test-masked-row="line.id"
        >
          <span class="min-w-0 flex-1 font-mono text-[12px] wrap-break-word text-app-muted">
            {{ display(line) }}
          </span>
          <button
            class="shrink-0 rounded p-1 transition-colors"
            :class="revealed.has(line.id) ? 'text-app-accent' : 'text-app-muted hover:text-app-text'"
            :title="revealed.has(line.id) ? 'Masquer à nouveau' : 'Révéler'"
            @click="toggleReveal(line.id)"
          >
            <component :is="revealed.has(line.id) ? IconEyeOff : IconEye" class="size-3.5" />
          </button>
          <button
            class="shrink-0 rounded p-1 text-app-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-app-text"
            title="Copier sans révéler"
            @click="copy(line)"
          >
            <IconCopy class="size-3.5" />
          </button>
          <button
            class="shrink-0 rounded p-1 text-app-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-app-accent"
            title="Ne plus masquer"
            :data-test-unmask="line.id"
            @click="unmask(line)"
          >
            <IconUndoDot class="size-3.5" />
          </button>
        </li>
      </ul>
    </div>

    <!-- Outil « Exercices » : le guide de prompt du type, la leçon d'une
         question, et les séries déjà archivées. -->
    <GuidePanel v-else-if="ui.sidebar.panel === 'guide'" :project-id="projectId" />
    <LessonPanel v-else-if="ui.sidebar.panel === 'lesson'" />
    <RunsPanel v-else :set-id="sequenceId" />
  </aside>
</template>
