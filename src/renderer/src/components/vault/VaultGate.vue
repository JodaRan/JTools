<script setup lang="ts">
/**
 * Ce qui s'affiche à la place de l'application tant que le coffre n'est pas
 * ouvert : proposition de chiffrer au premier lancement, demande de
 * passphrase ensuite, et écran d'échec si les fichiers sont illisibles.
 *
 * L'état d'échec est volontairement sans issue : laisser entrer dans une
 * application vide alors que des données chiffrées existent conduirait à les
 * écraser au premier enregistrement.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { NAlert, NButton, NInput } from 'naive-ui'
import { useUiStore } from '@/stores/ui'
import { useVaultStore } from '@/stores/vault'
import { startSession } from '@/lib/session'
import RecoveryKeyPanel from './RecoveryKeyPanel.vue'
import IconLock from '~icons/lucide/lock'
import IconShield from '~icons/lucide/shield'
import IconAlert from '~icons/lucide/triangle-alert'

const vault = useVaultStore()
const ui = useUiStore()
const router = useRouter()

const passphrase = ref('')
const confirmation = ref('')
const busy = ref(false)
const error = ref('')
const useRecovery = ref(false)
const field = ref<InstanceType<typeof NInput> | null>(null)

const showRecoveryKey = computed(() => vault.freshRecoveryKey !== null)

/** Le champ doit être prêt à recevoir la frappe sans un clic préalable. */
watch(
  () => vault.gate,
  async () => {
    await nextTick()
    field.value?.focus()
  },
  { immediate: true }
)

watch(useRecovery, async () => {
  passphrase.value = ''
  error.value = ''
  await nextTick()
  field.value?.focus()
})

// ————————————————————————— Déverrouillage —————————————————————————

async function submitUnlock(): Promise<void> {
  if (busy.value || !passphrase.value) return
  busy.value = true
  error.value = ''

  const ok = useRecovery.value
    ? await vault.unlockWithRecovery(passphrase.value)
    : await vault.unlock(passphrase.value)

  if (!ok) {
    busy.value = false
    error.value = useRecovery.value
      ? "Cette clé de secours n'ouvre pas ce coffre."
      : 'Mot de passe incorrect.'
    passphrase.value = ''
    await nextTick()
    field.value?.focus()
    return
  }

  passphrase.value = ''
  await startSession(router)
  busy.value = false
}

// ————————————————————————— Première ouverture —————————————————————————

const setupError = computed(() => {
  if (!passphrase.value) return ''
  if (passphrase.value.length < 10) return 'Au moins 10 caractères.'
  if (confirmation.value && passphrase.value !== confirmation.value) {
    return 'Les deux saisies diffèrent.'
  }
  return ''
})

const canCreate = computed(
  () =>
    passphrase.value.length >= 10 && passphrase.value === confirmation.value && !busy.value
)

async function create(): Promise<void> {
  if (!canCreate.value) return
  busy.value = true
  await vault.create(passphrase.value)
  ui.setSecurity({ prompted: true })
  passphrase.value = ''
  confirmation.value = ''
  busy.value = false
}

/** « Plus tard » : on ne repose plus la question, le coffre reste facultatif. */
function decline(): void {
  ui.setSecurity({ prompted: true })
  vault.offerSetup = false
}

function acknowledgeRecoveryKey(): void {
  vault.freshRecoveryKey = null
}

const openDataFolder = (): void => window.jtools.store.reveal()
</script>

<template>
  <main class="flex min-h-0 flex-1 items-center justify-center overflow-auto p-8">
    <div class="w-full max-w-md" data-test="vault-gate">
      <!-- La clé de secours passe avant tout le reste : elle ne se revoit pas. -->
      <section v-if="showRecoveryKey">
        <h1 class="mb-1 text-xl font-semibold">Votre clé de secours</h1>
        <p class="mb-5 text-[13px] text-app-muted">
          Le coffre est actif. Vos données sont désormais chiffrées sur le disque.
        </p>
        <RecoveryKeyPanel
          :recovery-key="vault.freshRecoveryKey!"
          @acknowledge="acknowledgeRecoveryKey"
        />
      </section>

      <!-- Stockage chiffré qu'on n'arrive pas à ouvrir : impasse volontaire. -->
      <section v-else-if="vault.gate === 'error'" class="flex flex-col gap-4">
        <div class="flex items-center gap-2 text-red-500">
          <IconAlert class="size-5" />
          <h1 class="text-xl font-semibold">Données illisibles</h1>
        </div>
        <NAlert type="error" :bordered="false">
          Le coffre s'est ouvert, mais les fichiers ne se déchiffrent pas. Ils ont
          probablement été remplacés par ceux d'un autre coffre.
        </NAlert>
        <p class="text-[13px] text-app-muted">
          L'application s'arrête ici volontairement : entrer sur un espace vide
          écraserait ces fichiers au premier enregistrement. Restaurez une
          sauvegarde, ou remettez en place le <code>vault.json</code> d'origine.
        </p>
        <NButton data-test="open-data-folder" @click="openDataFolder">
          Ouvrir le dossier de données
        </NButton>
      </section>

      <!-- Demande de passphrase -->
      <section v-else-if="vault.gate === 'locked'" class="flex flex-col gap-4">
        <div class="flex items-center gap-2">
          <IconLock class="size-5 text-app-accent" />
          <h1 class="text-xl font-semibold">JTools est verrouillé</h1>
        </div>

        <NInput
          ref="field"
          v-model:value="passphrase"
          :type="useRecovery ? 'text' : 'password'"
          show-password-on="click"
          :placeholder="useRecovery ? 'Clé de secours' : 'Mot de passe'"
          :status="error ? 'error' : undefined"
          :disabled="busy"
          data-test="unlock-input"
          @keydown.enter="submitUnlock"
        />

        <p v-if="error" class="-mt-2 text-[13px] text-red-500" data-test="unlock-error">
          {{ error }}
        </p>

        <NButton
          type="primary"
          :loading="busy"
          :disabled="!passphrase"
          data-test="unlock-submit"
          @click="submitUnlock"
        >
          Déverrouiller
        </NButton>

        <button
          class="self-center text-[13px] text-app-muted underline-offset-2 hover:text-app-text hover:underline"
          data-test="toggle-recovery"
          @click="useRecovery = !useRecovery"
        >
          {{ useRecovery ? 'Utiliser mon mot de passe' : 'J’ai oublié mon mot de passe' }}
        </button>
      </section>

      <!-- Proposition de chiffrer, au premier lancement -->
      <section v-else-if="vault.gate === 'setup'" class="flex flex-col gap-4">
        <div class="flex items-center gap-2">
          <IconShield class="size-5 text-app-accent" />
          <h1 class="text-xl font-semibold">Protéger vos données</h1>
        </div>

        <p class="text-[13px] text-app-muted">
          JTools va contenir des chemins de serveurs, des mots de passe et des clés.
          Un mot de passe maître les chiffre sur le disque et dans vos exports —
          qui restent lisibles sur n'importe quelle machine, avec ce mot de passe.
        </p>

        <NInput
          ref="field"
          v-model:value="passphrase"
          type="password"
          show-password-on="click"
          placeholder="Mot de passe maître"
          data-test="setup-input"
        />
        <NInput
          v-model:value="confirmation"
          type="password"
          show-password-on="click"
          placeholder="Confirmer"
          data-test="setup-confirm"
          @keydown.enter="create"
        />

        <p v-if="setupError" class="-mt-2 text-[13px] text-red-500">{{ setupError }}</p>

        <NAlert type="warning" :bordered="false">
          Il n'existe aucun moyen de récupérer un mot de passe oublié. Une clé de
          secours vous sera remise juste après.
        </NAlert>

        <NButton
          type="primary"
          :disabled="!canCreate"
          :loading="busy"
          data-test="setup-submit"
          @click="create"
        >
          Chiffrer mes données
        </NButton>

        <button
          class="self-center text-[13px] text-app-muted underline-offset-2 hover:text-app-text hover:underline"
          data-test="setup-decline"
          @click="decline"
        >
          Plus tard — on pourra l'activer depuis le menu
        </button>
      </section>
    </div>
  </main>
</template>
