<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NDropdown, useMessage } from 'naive-ui'
import { useUiStore } from '@/stores/ui'
import { useUndoStore } from '@/stores/undo'
import { useVaultStore } from '@/stores/vault'
import { copyBackup, loadBackupFromFile, saveBackupToFile } from '@/lib/backup'
import WindowControls from './WindowControls.vue'
import TabBar from './TabBar.vue'
import VaultSettings from '@/components/vault/VaultSettings.vue'
import SecretPrompt from '@/components/vault/SecretPrompt.vue'
import IconSun from '~icons/lucide/sun'
import IconMoon from '~icons/lucide/moon'
import IconMenu from '~icons/lucide/menu'
import IconLock from '~icons/lucide/lock'

/** En mode réduit — coffre fermé — il ne reste que de quoi bouger la fenêtre. */
const props = defineProps<{ minimal?: boolean }>()

const ui = useUiStore()
const undo = useUndoStore()
const vault = useVaultStore()
const message = useMessage()
const version = ref('')
const showSettings = ref(false)
const secretPrompt = ref<InstanceType<typeof SecretPrompt> | null>(null)

onMounted(async () => {
  version.value = await window.jtools.app.getVersion()
})

const menuOptions = computed(() => [
  { key: 'copy', label: 'Copier la sauvegarde' },
  { key: 'export', label: 'Exporter dans un fichier…' },
  { key: 'import', label: 'Importer une sauvegarde…' },
  { type: 'divider', key: 'd1' },
  {
    key: 'security',
    label: vault.active ? 'Sécurité — chiffré' : 'Sécurité — non chiffré'
  },
  ...(vault.active ? [{ key: 'lock', label: 'Verrouiller maintenant' }] : []),
  { type: 'divider', key: 'd2' },
  { key: 'reveal', label: 'Ouvrir le dossier de données' }
])

async function onMenu(key: string): Promise<void> {
  if (key === 'copy') {
    await copyBackup(version.value)
    message.success(
      vault.active
        ? 'Sauvegarde chiffrée copiée dans le presse-papiers.'
        : 'Sauvegarde copiée dans le presse-papiers.'
    )
  }
  if (key === 'export') {
    const path = await saveBackupToFile(version.value)
    if (path) message.success(`Sauvegarde écrite dans ${path}`)
  }
  if (key === 'import') {
    const result = await loadBackupFromFile(
      () => secretPrompt.value?.ask() ?? Promise.resolve(null)
    )
    if (!result) return
    if (result.ok) {
      // Les commandes d'avant ne décrivent plus l'état courant.
      undo.reset()
      message.success('Sauvegarde restaurée.')
    } else {
      message.error(result.reason ?? 'Import impossible.')
    }
  }
  if (key === 'security') showSettings.value = true
  if (key === 'lock') vault.lock()
  if (key === 'reveal') window.jtools.store.reveal()
}
</script>

<template>
  <header
    class="app-drag flex h-10 shrink-0 items-stretch border-b border-app-border bg-app-surface select-none"
  >
    <div class="flex items-center gap-2 pr-2 pl-3">
      <span
        class="grid size-5 place-items-center rounded bg-app-accent text-[11px] font-bold text-white"
        >J</span
      >
      <span class="text-[13px] font-medium text-app-text">JTools</span>
      <IconLock
        v-if="vault.active"
        class="size-3.5 text-app-muted"
        title="Données chiffrées"
        data-test="vault-badge"
      />
    </div>

    <template v-if="!props.minimal">
      <NDropdown trigger="click" :options="menuOptions" placement="bottom-start" @select="onMenu">
        <button
          class="app-no-drag flex w-8 items-center justify-center text-app-muted transition-colors hover:bg-app-surface-2 hover:text-app-text"
          title="Sauvegarde, sécurité et données"
          data-test="app-menu"
        >
          <IconMenu class="size-4" />
        </button>
      </NDropdown>

      <TabBar />
    </template>

    <div v-else class="min-w-0 flex-1"></div>

    <button
      class="app-no-drag flex w-[46px] items-center justify-center text-app-muted transition-colors hover:bg-app-surface-2 hover:text-app-text"
      :title="ui.isDark ? 'Passer en clair' : 'Passer en sombre'"
      data-test="theme-toggle"
      @click="ui.toggleTheme()"
    >
      <component :is="ui.isDark ? IconSun : IconMoon" class="size-4" />
    </button>

    <WindowControls />
  </header>

  <VaultSettings v-model="showSettings" />
  <SecretPrompt ref="secretPrompt" />
</template>
