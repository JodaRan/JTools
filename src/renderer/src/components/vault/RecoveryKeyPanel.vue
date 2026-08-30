<script setup lang="ts">
/**
 * Affichage de la clé de secours. C'est le seul moment où elle est lisible :
 * seule sa forme encapsulée est conservée, personne ne peut la retrouver
 * ensuite — ni vous, ni moi.
 */
import { ref } from 'vue'
import { NAlert, NButton } from 'naive-ui'
import IconCopy from '~icons/lucide/copy'
import IconCheck from '~icons/lucide/check'
import IconSave from '~icons/lucide/download'

const props = defineProps<{ recoveryKey: string }>()
const emit = defineEmits<{ acknowledge: [] }>()

const copied = ref(false)
const saved = ref(false)
const confirmed = ref(false)

function copy(): void {
  window.jtools.clipboard.write(props.recoveryKey)
  copied.value = true
}

async function save(): Promise<void> {
  const content = [
    'Clé de secours JTools',
    '',
    props.recoveryKey,
    '',
    "Elle ouvre vos données même si vous oubliez votre mot de passe.",
    "Conservez-la hors de cet ordinateur : sur papier, ou dans un autre coffre.",
    `Générée le ${new Date().toLocaleString('fr-FR')}.`
  ].join('\n')
  // En clair, délibérément : chiffrée par le coffre, elle serait inutile.
  const path = await window.jtools.file.saveText('cle-de-secours-jtools.txt', content)
  if (path) saved.value = true
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <NAlert type="warning" :bordered="false">
      Notez cette clé <strong>maintenant</strong>. Elle est votre seule porte de
      secours si vous oubliez le mot de passe — il n'y en a aucune autre, et
      elle ne sera plus jamais affichée.
    </NAlert>

    <output
      class="block rounded-lg border border-app-border bg-app-surface-2 p-4 text-center font-mono text-[15px] leading-7 tracking-wider break-all select-all"
      data-test="recovery-key"
    >
      {{ recoveryKey }}
    </output>

    <div class="flex gap-2">
      <NButton class="flex-1" data-test="recovery-copy" @click="copy">
        <template #icon>
          <component :is="copied ? IconCheck : IconCopy" />
        </template>
        {{ copied ? 'Copiée' : 'Copier' }}
      </NButton>
      <NButton class="flex-1" data-test="recovery-save" @click="save">
        <template #icon><IconSave /></template>
        {{ saved ? 'Enregistrée' : 'Enregistrer…' }}
      </NButton>
    </div>

    <label class="flex cursor-pointer items-start gap-2 text-[13px] text-app-muted">
      <input v-model="confirmed" type="checkbox" class="mt-0.5" data-test="recovery-confirm" />
      <span>
        J'ai mis cette clé en lieu sûr, ailleurs que sur cet ordinateur.
      </span>
    </label>

    <NButton
      type="primary"
      :disabled="!confirmed"
      data-test="recovery-done"
      @click="emit('acknowledge')"
    >
      Continuer
    </NButton>
  </div>
</template>
