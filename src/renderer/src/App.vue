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
import TitleBar from '@/components/shell/TitleBar.vue'
import AppBody from '@/components/shell/AppBody.vue'

const ui = useUiStore()
const theme = computed(() => (ui.isDark ? darkTheme : null))

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
          <TitleBar />
          <AppBody />
        </div>
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>
