<script setup lang="ts">
import { computed } from 'vue'
import {
  NConfigProvider,
  NDialogProvider,
  NMessageProvider,
  darkTheme,
  type GlobalThemeOverrides
} from 'naive-ui'
import { useUiStore } from '@/stores/ui'
import { useVaultStore } from '@/stores/vault'
import TitleBar from '@/components/shell/TitleBar.vue'
import AppBody from '@/components/shell/AppBody.vue'
import VaultGate from '@/components/vault/VaultGate.vue'

const ui = useUiStore()
const vault = useVaultStore()
const theme = computed(() => (ui.isDark ? darkTheme : null))

/**
 * Tant que le coffre n'est pas ouvert, l'application n'est pas montée : ni
 * onglets, ni routeur, ni données. La barre de titre passe en version réduite
 * pour qu'on puisse quand même déplacer et fermer la fenêtre.
 */
const open = computed(() => vault.gate === 'open')

// Naive UI reprend la police et le rayon du chrome maison.
const themeOverrides: GlobalThemeOverrides = {
  common: {
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif",
    borderRadius: '6px'
  }
}
</script>

<template>
  <NConfigProvider :theme="theme" :theme-overrides="themeOverrides" class="h-full">
    <NMessageProvider :max="3" placement="bottom">
      <NDialogProvider>
        <div class="flex h-full flex-col bg-app-bg text-app-text">
          <TitleBar :minimal="!open" />
          <AppBody v-if="open" />
          <VaultGate v-else />
        </div>
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>
