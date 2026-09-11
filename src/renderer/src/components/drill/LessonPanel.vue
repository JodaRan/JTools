<script setup lang="ts">
/**
 * La leçon d'une question, affichée à la demande.
 *
 * Toutes les questions n'en portent pas : seuls les exercices qui supposent
 * une notion préalable — les mathématiques, pour l'essentiel. Quand le CSV ne
 * sait pas rendre une formule ou un graphe, la leçon renvoie vers une page en
 * ligne plutôt que de s'écrire en texte illisible.
 */
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'
import { useDrillPanel } from '@/composables/useDrillPanel'
import IconLink from '~icons/lucide/external-link'

const data = useDataStore()
const { lessonQuestionId } = useDrillPanel()

const question = computed(() =>
  lessonQuestionId.value ? data.question(lessonQuestionId.value) : undefined
)

/** Un lien ne s'affiche que s'il mène vraiment sur le web. */
const link = computed(() => {
  const url = question.value?.lessonUrl.trim() ?? ''
  return /^https?:\/\//i.test(url) ? url : ''
})

const host = computed(() => {
  try {
    return new URL(link.value).hostname.replace(/^www\./, '')
  } catch {
    return link.value
  }
})
</script>

<template>
  <div class="min-h-0 flex-1 overflow-auto p-3">
    <p v-if="!question" class="text-[12px] text-app-muted">
      Cliquez sur « Leçon » au-dessus d'une question pour l'afficher ici.
    </p>

    <template v-else>
      <p class="text-[12px] text-app-muted whitespace-pre-wrap">{{ question.prompt }}</p>

      <p
        v-if="question.lesson"
        class="mt-3 border-t border-app-border pt-3 text-[13px] leading-relaxed whitespace-pre-wrap"
        data-test="lesson-text"
      >
        {{ question.lesson }}
      </p>
      <p v-else-if="!link" class="mt-3 text-[12px] text-app-muted">
        Cette question ne porte pas de leçon.
      </p>

      <a
        v-if="link"
        :href="link"
        target="_blank"
        rel="noreferrer"
        class="mt-3 flex items-center gap-1.5 rounded-md border border-app-border px-2 py-1.5 text-[12px] text-app-muted transition-colors hover:border-app-accent hover:text-app-text"
        data-test="lesson-link"
      >
        <IconLink class="size-3.5 shrink-0" />
        <span class="min-w-0 truncate">Leçon en ligne — {{ host }}</span>
      </a>
    </template>
  </div>
</template>
