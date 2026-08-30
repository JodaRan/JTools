<script setup lang="ts">
/**
 * Réglages du coffre, accessibles seulement depuis l'intérieur de
 * l'application — donc en aval de la demande de mot de passe.
 *
 * Chaque opération sensible redemande la passphrase courante, même si le
 * coffre est déjà ouvert : sinon un écran laissé déverrouillé suffirait à se
 * l'approprier.
 */
import { computed, ref, watch } from 'vue'
import { NAlert, NButton, NInput, NModal, NSelect } from 'naive-ui'
import { useUiStore } from '@/stores/ui'
import { useVaultStore } from '@/stores/vault'
import RecoveryKeyPanel from './RecoveryKeyPanel.vue'

const open = defineModel<boolean>({ required: true })

const ui = useUiStore()
const vault = useVaultStore()

type Panel = 'menu' | 'enable' | 'passphrase' | 'recovery' | 'disable'
const panel = ref<Panel>('menu')

const current = ref('')
const next = ref('')
const confirmation = ref('')
const busy = ref(false)
const error = ref('')
const done = ref('')

const idleOptions = [
  { label: 'Après 5 minutes', value: 5 },
  { label: 'Après 15 minutes', value: 15 },
  { label: 'Après 30 minutes', value: 30 },
  { label: 'Après 1 heure', value: 60 },
  { label: 'Jamais', value: 0 }
]

function reset(): void {
  current.value = ''
  next.value = ''
  confirmation.value = ''
  error.value = ''
  done.value = ''
  busy.value = false
}

watch(open, (value) => {
  if (!value) return
  panel.value = 'menu'
  reset()
})

const strongEnough = computed(
  () => next.value.length >= 10 && next.value === confirmation.value
)

async function enable(): Promise<void> {
  if (!strongEnough.value) return
  busy.value = true
  await vault.create(next.value)
  ui.setSecurity({ prompted: true })
  reset()
  // La clé de secours s'affiche ici même, avant toute autre chose.
  panel.value = 'recovery'
}

async function changePassphrase(): Promise<void> {
  if (!strongEnough.value || !current.value) return
  busy.value = true
  error.value = ''
  const ok = await vault.changePassphrase(current.value, next.value)
  busy.value = false
  if (!ok) {
    error.value = 'Mot de passe actuel incorrect.'
    return
  }
  reset()
  done.value = 'Mot de passe changé. Vos exports précédents gardent l’ancien.'
  panel.value = 'menu'
}

async function regenerate(): Promise<void> {
  if (!current.value) return
  busy.value = true
  error.value = ''
  const key = await vault.regenerateRecovery(current.value)
  busy.value = false
  if (!key) {
    error.value = 'Mot de passe incorrect.'
    return
  }
  reset()
}

async function disable(): Promise<void> {
  if (!current.value) return
  busy.value = true
  error.value = ''
  const ok = await vault.disable(current.value)
  busy.value = false
  if (!ok) {
    error.value = 'Mot de passe incorrect.'
    return
  }
  reset()
  done.value = 'Chiffrement désactivé. Vos fichiers sont de nouveau en clair.'
  panel.value = 'menu'
}

function acknowledgeRecoveryKey(): void {
  vault.freshRecoveryKey = null
  panel.value = 'menu'
}
</script>

<template>
  <NModal
    v-model:show="open"
    preset="card"
    class="max-w-lg"
    title="Sécurité"
    :bordered="false"
    data-test="vault-settings"
  >
    <!-- Une clé fraîchement produite passe avant tout : elle ne se revoit pas. -->
    <RecoveryKeyPanel
      v-if="vault.freshRecoveryKey"
      :recovery-key="vault.freshRecoveryKey"
      @acknowledge="acknowledgeRecoveryKey"
    />

    <div v-else-if="panel === 'menu'" class="flex flex-col gap-4">
      <p v-if="done" class="rounded bg-app-surface-2 p-3 text-[13px]">{{ done }}</p>

      <template v-if="vault.active">
        <div class="flex items-start gap-2 text-[13px] text-app-muted">
          <span class="text-app-accent">●</span>
          <span>
            Vos données et vos exports sont chiffrés. Un export s'ouvre sur une
            autre machine avec ce mot de passe.
          </span>
        </div>

        <label class="flex flex-col gap-1.5">
          <span class="text-[13px] font-medium">Verrouiller après inactivité</span>
          <NSelect
            :value="ui.security.idleLockMinutes"
            :options="idleOptions"
            data-test="idle-select"
            @update:value="(value: number) => ui.setSecurity({ idleLockMinutes: value })"
          />
        </label>

        <div class="flex flex-col gap-2">
          <NButton data-test="open-change-passphrase" @click="panel = 'passphrase'">
            Changer le mot de passe…
          </NButton>
          <NButton data-test="open-regenerate" @click="panel = 'recovery'">
            Générer une nouvelle clé de secours…
          </NButton>
          <NButton quaternary type="error" data-test="open-disable" @click="panel = 'disable'">
            Désactiver le chiffrement…
          </NButton>
        </div>
      </template>

      <template v-else>
        <NAlert type="warning" :bordered="false">
          Vos données sont en clair sur le disque, et vos exports aussi.
        </NAlert>
        <NButton type="primary" data-test="open-enable" @click="panel = 'enable'">
          Chiffrer mes données…
        </NButton>
      </template>
    </div>

    <!-- Activation -->
    <div v-else-if="panel === 'enable'" class="flex flex-col gap-3">
      <p class="text-[13px] text-app-muted">
        Le mot de passe sera demandé à chaque démarrage. Aucun moyen de le
        récupérer s'il est oublié — une clé de secours suivra.
      </p>
      <NInput
        v-model:value="next"
        type="password"
        show-password-on="click"
        placeholder="Mot de passe maître (10 caractères minimum)"
      />
      <NInput
        v-model:value="confirmation"
        type="password"
        show-password-on="click"
        placeholder="Confirmer"
      />
      <div class="flex gap-2">
        <NButton class="flex-1" @click="((panel = 'menu'), reset())">Annuler</NButton>
        <NButton
          class="flex-1"
          type="primary"
          :disabled="!strongEnough"
          :loading="busy"
          data-test="confirm-enable"
          @click="enable"
        >
          Chiffrer
        </NButton>
      </div>
    </div>

    <!-- Changement de mot de passe -->
    <div v-else-if="panel === 'passphrase'" class="flex flex-col gap-3">
      <NInput
        v-model:value="current"
        type="password"
        show-password-on="click"
        placeholder="Mot de passe actuel"
      />
      <NInput
        v-model:value="next"
        type="password"
        show-password-on="click"
        placeholder="Nouveau mot de passe"
      />
      <NInput
        v-model:value="confirmation"
        type="password"
        show-password-on="click"
        placeholder="Confirmer"
      />
      <p v-if="error" class="text-[13px] text-red-500">{{ error }}</p>
      <p class="text-[12px] text-app-muted">
        Les fichiers ne sont pas rechiffrés : seule la clé change d'enveloppe.
        Vos exports déjà produits restent lisibles avec l'ancien mot de passe.
      </p>
      <div class="flex gap-2">
        <NButton class="flex-1" @click="((panel = 'menu'), reset())">Annuler</NButton>
        <NButton
          class="flex-1"
          type="primary"
          :disabled="!strongEnough || !current"
          :loading="busy"
          data-test="confirm-passphrase"
          @click="changePassphrase"
        >
          Changer
        </NButton>
      </div>
    </div>

    <!-- Nouvelle clé de secours -->
    <div v-else-if="panel === 'recovery'" class="flex flex-col gap-3">
      <NAlert type="warning" :bordered="false">
        L'ancienne clé de secours cessera immédiatement de fonctionner.
      </NAlert>
      <NInput
        v-model:value="current"
        type="password"
        show-password-on="click"
        placeholder="Mot de passe actuel"
      />
      <p v-if="error" class="text-[13px] text-red-500">{{ error }}</p>
      <div class="flex gap-2">
        <NButton class="flex-1" @click="((panel = 'menu'), reset())">Annuler</NButton>
        <NButton
          class="flex-1"
          type="primary"
          :disabled="!current"
          :loading="busy"
          data-test="confirm-regenerate"
          @click="regenerate"
        >
          Générer
        </NButton>
      </div>
    </div>

    <!-- Désactivation -->
    <div v-else class="flex flex-col gap-3">
      <NAlert type="error" :bordered="false">
        Vos données et vos exports repasseront en clair sur le disque.
      </NAlert>
      <NInput
        v-model:value="current"
        type="password"
        show-password-on="click"
        placeholder="Mot de passe actuel"
      />
      <p v-if="error" class="text-[13px] text-red-500">{{ error }}</p>
      <div class="flex gap-2">
        <NButton class="flex-1" @click="((panel = 'menu'), reset())">Annuler</NButton>
        <NButton
          class="flex-1"
          type="error"
          :disabled="!current"
          :loading="busy"
          data-test="confirm-disable"
          @click="disable"
        >
          Désactiver
        </NButton>
      </div>
    </div>
  </NModal>
</template>
