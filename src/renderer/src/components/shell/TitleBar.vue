<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { NDropdown, useMessage } from 'naive-ui'
import { useUiStore } from '@/stores/ui'
import { useUndoStore } from '@/stores/undo'
import { copyBackup, loadBackupFromFile, saveBackupToFile } from '@/lib/backup'
import WindowControls from './WindowControls.vue'
import TabBar from './TabBar.vue'
import IconSun from '~icons/lucide/sun'
import IconMoon from '~icons/lucide/moon'
import IconMenu from '~icons/lucide/menu'

const ui = useUiStore()
const undo = useUndoStore()
const message = useMessage()
const version = ref('')

onMounted(async () => {
  version.value = await window.jtools.app.getVersion()
})

const menuOptions = [
  { key: 'copy', label: 'Copier la sauvegarde' },
  { key: 'export', label: 'Exporter dans un fichier…' },
  { key: 'import', label: 'Importer une sauvegarde…' },
  { type: 'divider', key: 'd1' },
  { key: 'reveal', label: 'Ouvrir le dossier de données' }
]

async function onMenu(key: string): Promise<void> {
  if (key === 'copy') {
    copyBackup(version.value)
    message.success('Sauvegarde copiée dans le presse-papiers.')
  }
  if (key === 'export') {
    const path = await saveBackupToFile(version.value)
    if (path) message.success(`Sauvegarde écrite dans ${path}`)
  }
  if (key === 'import') {
    const result = await loadBackupFromFile()
    if (!result) return
    if (result.ok) {
      // Les commandes d'avant ne décrivent plus l'état courant.
      undo.reset()
      message.success('Sauvegarde restaurée.')
    } else {
      message.error(result.reason ?? 'Import impossible.')
    }
  }
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
    </div>

    <NDropdown trigger="click" :options="menuOptions" placement="bottom-start" @select="onMenu">
      <button
        class="app-no-drag flex w-8 items-center justify-center text-app-muted transition-colors hover:bg-app-surface-2 hover:text-app-text"
        title="Sauvegarde et données"
        data-test="app-menu"
      >
        <IconMenu class="size-4" />
      </button>
    </NDropdown>

    <TabBar />

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
</template>
