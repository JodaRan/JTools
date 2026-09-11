<script setup lang="ts">
/**
 * Guide de prompt d'un type d'exercice.
 *
 * Le guide se lit en deux morceaux : un texte général, qui décrit la forme du
 * CSV et suit le code de l'importateur — donc non modifiable —, et la
 * spécification propre au type, qui est de la donnée et s'édite ici. Le bouton
 * copie les deux, assemblés : c'est ce bloc-là qu'on colle dans un LLM.
 */
import { computed, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { useDataStore } from '@/stores/data'
import { useUndoStore } from '@/stores/undo'
import { GENERAL_PROMPT_GUIDE, buildPromptGuide } from '@/lib/drill-prompts'
import { setTypeSpec } from '@/lib/drill-commands'
import IconCopy from '~icons/lucide/copy'

const props = defineProps<{ projectId: string | null }>()

const data = useDataStore()
const undo = useUndoStore()
const message = useMessage()

const project = computed(() => (props.projectId ? data.project(props.projectId) : undefined))
const spec = computed(() => (props.projectId ? (data.drillType(props.projectId)?.spec ?? '') : ''))

const draft = ref('')
watch(spec, (value) => (draft.value = value), { immediate: true })

const showGeneral = ref(false)

function commit(): void {
  if (!props.projectId || draft.value === spec.value) return
  undo.run(setTypeSpec(props.projectId, draft.value))
}

function copy(): void {
  if (!project.value) return
  window.jtools.clipboard.write(buildPromptGuide(project.value.name, draft.value))
  message.success('Guide copié — collez-le dans un LLM.')
}
</script>

<template>
  <div class="min-h-0 flex-1 overflow-auto p-3">
    <p v-if="!project" class="text-[12px] text-app-muted">
      Ouvrez un type d'exercice pour voir son guide de prompt.
    </p>

    <template v-else>
      <div class="flex items-center gap-2">
        <p class="min-w-0 flex-1 truncate text-[13px] font-medium">{{ project.name }}</p>
        <button
          class="flex shrink-0 items-center gap-1.5 rounded-md border border-app-border px-2 py-1 text-[12px] text-app-muted transition-colors hover:border-app-accent hover:text-app-text"
          title="Copier le guide complet : général + spécifique"
          data-test="copy-guide"
          @click="copy"
        >
          <IconCopy class="size-3.5" />
          Copier
        </button>
      </div>

      <p class="mt-2 text-[12px] text-app-muted">
        Ce qui suit s'ajoute au guide général pour former le prompt de ce type.
      </p>

      <textarea
        v-model="draft"
        rows="18"
        spellcheck="false"
        class="mt-2 w-full resize-y rounded-md border border-app-border bg-app-bg p-2 font-mono text-[11.5px] leading-relaxed outline-none focus:border-app-accent"
        data-test="type-spec"
        @blur="commit"
      ></textarea>

      <button
        class="mt-2 text-[12px] text-app-muted transition-colors hover:text-app-text"
        @click="showGeneral = !showGeneral"
      >
        {{ showGeneral ? 'Masquer' : 'Voir' }} le guide général
      </button>
      <pre
        v-if="showGeneral"
        class="mt-2 rounded-md bg-app-surface-2 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-app-muted"
        >{{ GENERAL_PROMPT_GUIDE }}</pre
      >
    </template>
  </div>
</template>
