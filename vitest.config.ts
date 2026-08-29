import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const root = (...segments: string[]): string => resolve(process.cwd(), ...segments)

export default defineConfig({
  resolve: {
    alias: {
      '@': root('src/renderer/src'),
      '@shared': root('src/shared')
    }
  },
  test: {
    // Les stores touchent à `window` (persistance, thème) dès leur import.
    environment: 'happy-dom',
    setupFiles: ['test/setup.ts'],
    include: ['test/**/*.spec.ts']
  }
})
