import type { JToolsApi } from './index'

declare global {
  interface Window {
    jtools: JToolsApi
  }
}

export {}
