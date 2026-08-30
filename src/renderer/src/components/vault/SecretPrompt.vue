<script setup lang="ts">
/**
 * Demande ponctuelle d'un secret, pour ouvrir une sauvegarde chiffrée venue
 * d'ailleurs. Le mot de passe demandé est celui du poste d'origine — pas
 * forcément celui d'ici.
 */
import { nextTick, ref } from 'vue'
import { NButton, NInput, NModal } from 'naive-ui'

const show = ref(false)
const value = ref('')
const field = ref<InstanceType<typeof NInput> | null>(null)
let resolve: ((secret: string | null) => void) | null = null

async function ask(): Promise<string | null> {
  value.value = ''
  show.value = true
  await nextTick()
  field.value?.focus()
  return new Promise((done) => {
    resolve = done
  })
}

function settle(secret: string | null): void {
  show.value = false
  resolve?.(secret)
  resolve = null
}

// Fermer par la croix ou par Échap vaut annulation.
function onUpdateShow(next: boolean): void {
  if (!next) settle(null)
  show.value = next
}

defineExpose({ ask })
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    class="max-w-sm"
    title="Sauvegarde chiffrée"
    :bordered="false"
    data-test="secret-prompt"
    @update:show="onUpdateShow"
  >
    <div class="flex flex-col gap-3">
      <p class="text-[13px] text-app-muted">
        Ce fichier vient d'un JTools chiffré. Saisissez le mot de passe de la
        machine qui l'a produit, ou sa clé de secours.
      </p>
      <NInput
        ref="field"
        v-model:value="value"
        type="password"
        show-password-on="click"
        placeholder="Mot de passe ou clé de secours"
        data-test="secret-input"
        @keydown.enter="settle(value)"
      />
      <div class="flex gap-2">
        <NButton class="flex-1" @click="settle(null)">Annuler</NButton>
        <NButton
          class="flex-1"
          type="primary"
          :disabled="!value"
          data-test="secret-submit"
          @click="settle(value)"
        >
          Ouvrir
        </NButton>
      </div>
    </div>
  </NModal>
</template>
