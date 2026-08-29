import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import icons from 'unplugin-icons/vite'

// Les chemins sont résolus depuis la racine du projet (cwd d'electron-vite).
const root = (...segments: string[]): string => resolve(process.cwd(), ...segments)

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: root('src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: root('src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: root('src/renderer'),
    resolve: {
      alias: { '@': root('src/renderer/src'), '@shared': root('src/shared') }
    },
    build: {
      rollupOptions: {
        input: { index: root('src/renderer/index.html') }
      }
    },
    // Les icônes lucide sont compilées en composants Vue : rien n'est
    // téléchargé à l'exécution (CSP stricte + fonctionnement hors ligne).
    plugins: [vue(), tailwindcss(), icons({ compiler: 'vue3', autoInstall: false })]
  }
})
