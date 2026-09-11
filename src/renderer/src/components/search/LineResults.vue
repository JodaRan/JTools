<script setup lang="ts">
/**
 * Résultats d'une recherche de mots dans les lignes des séquences.
 *
 * La palette « Ctrl+P » cherche des noms ; celle-ci cherche du contenu — la
 * commande dont on se souvient d'un bout, sans savoir où on l'a rangée. Elle
 * remplace la liste tant qu'une recherche est en cours, et chaque résultat
 * ouvre la séquence en posant le halo sur la ligne trouvée.
 *
 * La portée suit l'endroit d'où l'on cherche : tout l'outil depuis la liste
 * des projets, le seul projet depuis la liste de ses séquences.
 */
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'
import { useNavigation } from '@/composables/useNavigation'
import { useSpotlight } from '@/composables/useSpotlight'
import { searchLines, termsOf, type LineHit } from '@/lib/search'
import IconChevron from '~icons/lucide/chevron-right'

const props = defineProps<{
  toolId: string
  /** Absent depuis la liste des projets : la recherche porte alors sur tout l'outil. */
  projectId?: string
  query: string
}>()

const data = useDataStore()
const { openSequence } = useNavigation()
const { spot } = useSpotlight()

/** Au-delà, plus personne ne lit : mieux vaut inviter à préciser. */
const LIMIT = 200

interface Found {
  sequenceId: string
  sequenceName: string
  projectId: string
  projectName: string
  hits: LineHit[]
}

const scope = computed(() => {
  const projects = props.projectId
    ? [data.project(props.projectId)].filter((p) => p !== undefined)
    : data.projectsOfTool(props.toolId)
  return projects.flatMap((project) =>
    data.sequencesOfProject(project.id).map((sequence) => ({ project, sequence }))
  )
})

const results = computed<Found[]>(() => {
  const terms = termsOf(props.query)
  if (terms.length === 0) return []

  const out: Found[] = []
  let budget = LIMIT

  for (const { project, sequence } of scope.value) {
    if (budget <= 0) break
    // `visibleLines` donne l'ordre affiché : le numéro du résultat est alors
    // celui qu'on retrouvera dans la séquence une fois ouverte.
    const hits = searchLines(data.visibleLines(sequence.id), terms)
    if (hits.length === 0) continue
    const shown = hits.slice(0, budget)
    out.push({
      sequenceId: sequence.id,
      sequenceName: sequence.name,
      projectId: project.id,
      projectName: project.name,
      hits: shown
    })
    budget -= shown.length
  }
  return out
})

const total = computed(() => results.value.reduce((sum, found) => sum + found.hits.length, 0))

/** Vrai dès qu'une ligne masquée traîne dans la portée : on le dit une fois. */
const hasMasked = computed(() =>
  scope.value.some(({ sequence }) => data.maskedLines(sequence.id).length > 0)
)

async function go(found: Found, lineId?: string): Promise<void> {
  await openSequence(props.toolId, found.projectId, found.sequenceId)
  if (lineId) await spot(lineId)
}
</script>

<template>
  <div data-test="line-results">
    <p class="mb-3 text-[13px] text-app-muted">
      <template v-if="total === 0">
        Aucune ligne ne contient « {{ props.query.trim() }} ».
      </template>
      <template v-else>
        {{ total }} ligne(s) dans {{ results.length }} séquence(s).
      </template>
      <span v-if="hasMasked"> Les lignes masquées ne sont pas cherchées.</span>
    </p>

    <div v-for="found in results" :key="found.sequenceId" class="mb-4">
      <button
        class="group flex w-full min-w-0 items-center gap-1.5 rounded px-1 py-1 text-left transition-colors hover:bg-app-surface"
        :data-test-result-sequence="found.sequenceName"
        @click="go(found)"
      >
        <span v-if="!props.projectId" class="shrink-0 text-[12px] text-app-muted">
          {{ found.projectName }}
        </span>
        <IconChevron v-if="!props.projectId" class="size-3 shrink-0 text-app-muted" />
        <span class="min-w-0 truncate text-[13px] font-medium">{{ found.sequenceName }}</span>
        <span class="shrink-0 text-[12px] text-app-muted">{{ found.hits.length }}</span>
      </button>

      <button
        v-for="hit in found.hits"
        :key="hit.line.id"
        class="flex w-full min-w-0 items-start gap-2 rounded border border-transparent px-1 py-0.5 text-left transition-colors hover:border-app-border hover:bg-app-surface"
        :data-test-result-line="hit.line.id"
        @click="go(found, hit.line.id)"
      >
        <span class="mt-0.5 w-8 shrink-0 pl-3 text-right text-[11px] tabular-nums text-app-muted">
          {{ hit.position }}
        </span>
        <span class="min-w-0 flex-1 truncate font-mono text-[13px] leading-5 text-app-text">
          <span
            v-for="(part, index) in hit.excerpt"
            :key="index"
            :class="part.hit && 'rounded-sm bg-app-accent/25 font-semibold text-app-text'"
            >{{ part.text }}</span
          >
        </span>
      </button>
    </div>

    <p v-if="total >= LIMIT" class="text-[12px] text-app-muted">
      Affichage limité à {{ LIMIT }} lignes. Précisez la recherche.
    </p>
  </div>
</template>
