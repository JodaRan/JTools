<script setup lang="ts">
/**
 * Palette d'ouverture rapide — « Ctrl+P ».
 *
 * Elle ne cherche que ce qui s'ouvre dans un onglet : séquences et tableaux,
 * tous outils confondus. L'outil où l'on se trouve passe devant, séparé des
 * autres par un trait — on tape trois lettres et on tombe sur le bon sans
 * avoir à préciser d'où il vient. Sur l'index des outils, aucun n'est
 * prioritaire : les groupes s'affichent alors dans l'ordre du catalogue.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useTabsStore } from '@/stores/tabs'
import { useNavigation } from '@/composables/useNavigation'
import { usePalette } from '@/composables/usePalette'
import { fuzzyAll, segments, type Segment } from '@/lib/fuzzy'
import { tools, toolById, type ToolDefinition } from '@/tools/registry'
import IconSearch from '~icons/lucide/search'
import IconFolder from '~icons/lucide/folder'

const route = useRoute()
const data = useDataStore()
const tabs = useTabsStore()
const { openSequence, goToTab, goToExplorer } = useNavigation()
const { open, close } = usePalette()

/** Au-delà, la liste ne se parcourt plus à l'œil : on annonce le reste. */
const LIMIT = 50

interface Entry {
  sequenceId: string
  projectId: string
  toolId: string
  tool: ToolDefinition
  name: Segment[]
  project: Segment[]
  /** Déjà ouvert dans un onglet : l'indiquer évite d'en chercher un doublon. */
  opened: boolean
  score: number
  touched: number
}

interface Group {
  toolId: string
  label: string
  active: boolean
  entries: Entry[]
}

const query = ref('')
const cursor = ref(0)
const input = ref<HTMLInputElement | null>(null)
const list = ref<HTMLElement | null>(null)

/** L'outil courant, s'il y en a un. Sur l'index des outils, il n'y en a pas. */
const activeToolId = computed(() => (route.params.toolId as string | undefined) ?? null)

const matched = computed<Entry[]>(() => {
  const text = query.value.trim()
  const out: Entry[] = []

  for (const sequence of data.sequences) {
    const project = data.project(sequence.projectId)
    const tool = toolById(project?.toolId)
    if (!project || !tool) continue

    // Le nom du contenant compte aussi : « ephrata » doit ramener ses séquences.
    const onName = text ? fuzzyAll(sequence.name, text) : null
    const onProject = text ? fuzzyAll(project.name, text) : null
    if (text && !onName && !onProject) continue

    out.push({
      sequenceId: sequence.id,
      projectId: project.id,
      toolId: tool.id,
      tool,
      name: segments(sequence.name, onName?.hits ?? []),
      project: segments(project.name, onProject?.hits ?? []),
      opened: tabs.findBySequence(sequence.id) !== undefined,
      // Le nom pèse le double du projet qui le porte.
      score: (onName?.score ?? 0) * 2 + (onProject?.score ?? 0),
      touched: Date.parse(sequence.updatedAt) || 0
    })
  }

  // Sans saisie, la palette sert de liste des dernières séquences touchées.
  return out.sort((a, b) => b.score - a.score || b.touched - a.touched)
})

const groups = computed<Group[]>(() => {
  const byTool = new Map<string, Entry[]>()
  for (const entry of matched.value) {
    const bucket = byTool.get(entry.toolId)
    if (bucket) bucket.push(entry)
    else byTool.set(entry.toolId, [entry])
  }

  const rank = (tool: ToolDefinition): number => (tool.id === activeToolId.value ? 0 : 1)
  let budget = LIMIT

  return [...tools]
    .sort((a, b) => rank(a) - rank(b))
    .map((tool) => {
      const entries = (byTool.get(tool.id) ?? []).slice(0, Math.max(0, budget))
      budget -= entries.length
      return {
        toolId: tool.id,
        label: tool.name,
        active: tool.id === activeToolId.value,
        entries
      }
    })
    .filter((group) => group.entries.length > 0)
})

/** Les entrées mises bout à bout : c'est sur elles que courent les flèches. */
const flat = computed<Entry[]>(() => groups.value.flatMap((group) => group.entries))

const overflow = computed(() => matched.value.length - flat.value.length)

const indexOf = (entry: Entry): number =>
  flat.value.findIndex((item) => item.sequenceId === entry.sequenceId)

watch(open, async (isOpen) => {
  if (!isOpen) return
  query.value = ''
  cursor.value = 0
  await nextTick()
  input.value?.focus()
})

// La liste rétrécit à mesure qu'on tape : la sélection ne doit pas sortir.
watch(flat, () => {
  if (cursor.value > flat.value.length - 1) cursor.value = Math.max(0, flat.value.length - 1)
})

watch(query, () => {
  cursor.value = 0
})

async function move(direction: 1 | -1): Promise<void> {
  const count = flat.value.length
  if (count === 0) return
  // La liste boucle : en bas, la flèche du bas repart en haut.
  cursor.value = (cursor.value + direction + count) % count
  await nextTick()
  list.value
    ?.querySelector(`[data-palette-index="${cursor.value}"]`)
    ?.scrollIntoView({ block: 'nearest' })
}

/**
 * Ouvre l'entrée. `split` l'envoie dans le volet de droite en réutilisant la
 * logique des onglets : c'est elle qui décide de ce que devient le volet
 * principal, les deux volets ne pouvant montrer la même séquence.
 */
async function choose(entry: Entry | undefined, split = false): Promise<void> {
  if (!entry) return
  close()

  if (!split) {
    await openSequence(entry.toolId, entry.projectId, entry.sequenceId)
    return
  }

  const tab = tabs.open(entry.toolId, entry.projectId, entry.sequenceId)
  const primary = tabs.openSplit(tab.id)
  const next = tabs.tabs.find((item) => item.id === primary)
  if (next) await goToTab(next)
  else await goToExplorer()
}

/**
 * Tout le clavier se traite ici, et rien ne remonte : les raccourcis globaux
 * — Ctrl+W, Ctrl+Tab, Ctrl+1… — n'ont pas à s'appliquer pendant qu'on tape
 * dans la palette. L'annulation native du champ, elle, continue de marcher :
 * on arrête la propagation, pas l'action par défaut.
 */
function onKey(event: KeyboardEvent): void {
  event.stopPropagation()
  const ctrl = event.ctrlKey || event.metaKey

  if (event.key === 'Escape' || (ctrl && event.key.toLowerCase() === 'p')) {
    event.preventDefault()
    close()
    return
  }
  if (event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey)) {
    event.preventDefault()
    void move(1)
    return
  }
  if (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey)) {
    event.preventDefault()
    void move(-1)
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    void choose(flat.value[cursor.value], ctrl)
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[2000] flex justify-center bg-black/40 pt-[12vh]"
      data-test="palette"
      @pointerdown.self="close()"
    >
      <!-- `h-fit` : la palette épouse ses résultats. Un panneau qui garderait
           sa pleine hauteur pour trois entrées donnerait l'impression d'en
           cacher le reste. -->
      <div
        class="flex h-fit max-h-[70vh] w-[min(640px,92vw)] flex-col overflow-hidden rounded-lg border border-app-border bg-app-surface shadow-2xl"
      >
        <div class="flex shrink-0 items-center gap-2 border-b border-app-border px-3 py-2.5">
          <IconSearch class="size-4 shrink-0 text-app-muted" />
          <input
            ref="input"
            v-model="query"
            spellcheck="false"
            placeholder="Ouvrir une séquence ou un tableau — tapez quelques lettres"
            data-test="palette-input"
            class="min-w-0 flex-1 bg-transparent text-[14px] text-app-text outline-none placeholder:text-app-muted"
            @keydown="onKey"
          />
        </div>

        <div ref="list" class="min-h-0 overflow-y-auto py-1">
          <template v-for="(group, groupIndex) in groups" :key="group.toolId">
            <!-- Le trait sépare l'outil courant du reste : on voit d'un coup
                 d'œil ce qui vient d'ailleurs. -->
            <div
              v-if="groupIndex > 0"
              class="mx-3 my-1 border-t border-app-border"
              data-test="palette-separator"
            ></div>

            <p class="px-3 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-app-muted">
              <span class="uppercase">{{ group.label }}</span>
              <span v-if="group.active"> · outil courant</span>
            </p>

            <button
              v-for="entry in group.entries"
              :key="entry.sequenceId"
              class="flex w-full items-center gap-2.5 px-3 py-1.5 text-left"
              :class="indexOf(entry) === cursor && 'bg-app-surface-2'"
              :data-palette-index="indexOf(entry)"
              :data-test-palette-item="entry.sequenceId"
              @mousemove="cursor = indexOf(entry)"
              @click="choose(entry, $event.ctrlKey || $event.metaKey)"
            >
              <component :is="entry.tool.icon" class="size-4 shrink-0 text-app-muted" />

              <span class="min-w-0 flex-1 truncate text-[13px] text-app-text">
                <span
                  v-for="(part, i) in entry.name"
                  :key="i"
                  :class="part.hit && 'font-semibold text-app-accent'"
                  >{{ part.text }}</span
                >
              </span>

              <span
                v-if="entry.opened"
                class="shrink-0 rounded border border-app-border px-1 text-[10px] text-app-muted"
                title="Déjà ouvert dans un onglet"
              >
                ouvert
              </span>

              <span class="flex shrink-0 items-center gap-1 text-[12px] text-app-muted">
                <IconFolder class="size-3 shrink-0" />
                <span class="max-w-[180px] truncate">
                  <span
                    v-for="(part, i) in entry.project"
                    :key="i"
                    :class="part.hit && 'text-app-accent'"
                    >{{ part.text }}</span
                  >
                </span>
              </span>
            </button>
          </template>

          <p v-if="flat.length === 0" class="px-3 py-6 text-center text-[13px] text-app-muted">
            Aucune séquence ni tableau ne correspond.
          </p>
          <p v-else-if="overflow > 0" class="px-3 py-2 text-[12px] text-app-muted">
            … et {{ overflow }} autre(s). Précisez la recherche.
          </p>
        </div>

        <div
          class="flex shrink-0 flex-wrap items-center gap-x-3 border-t border-app-border px-3 py-1.5 text-[11px] text-app-muted"
        >
          <span>↑ ↓ parcourir</span>
          <span>Entrée ouvrir</span>
          <span>Ctrl+Entrée ouvrir à droite</span>
          <span>Échap fermer</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>
