import { contextBridge, ipcRenderer } from 'electron'
import type {
  BackupFile,
  DataFile,
  HistoryFile,
  ThemeMode,
  UiFile,
  WindowState
} from '../shared/models'

type StoreName = 'data' | 'history' | 'ui'

function subscribe<T>(channel: string, callback: (value: T) => void): () => void {
  const listener = (_event: unknown, value: T): void => callback(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.off(channel, listener)
}

/**
 * Seule surface exposée au renderer. Tout passe par ici : pas de `require`,
 * pas de Node dans la page.
 */
const api = {
  window: {
    minimize: (): void => ipcRenderer.send('window:minimize'),
    toggleMaximize: (): void => ipcRenderer.send('window:toggle-maximize'),
    close: (): void => ipcRenderer.send('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
    onMaximizedChange: (cb: (maximized: boolean) => void): (() => void) =>
      subscribe('window:maximized-changed', cb),
    onStateChange: (cb: (state: WindowState) => void): (() => void) =>
      subscribe('window:state-changed', cb)
  },
  theme: {
    setSource: (source: ThemeMode): void => ipcRenderer.send('theme:set-source', source),
    shouldUseDark: (): Promise<boolean> => ipcRenderer.invoke('theme:should-use-dark'),
    onChange: (cb: (dark: boolean) => void): (() => void) => subscribe('theme:changed', cb)
  },
  store: {
    readAll: (): Promise<{ data: DataFile; history: HistoryFile; ui: UiFile }> =>
      ipcRenderer.invoke('store:read-all'),
    /** `contents` est du JSON déjà sérialisé (voir `lib/persist.ts`). */
    write: (name: StoreName, contents: string): void =>
      ipcRenderer.send('store:write', name, contents),
    /** Réservé à la fermeture : bloque le temps que le fichier soit écrit. */
    writeSync: (name: StoreName, contents: string): void => {
      ipcRenderer.sendSync('store:write-sync', name, contents)
    },
    reveal: (): void => ipcRenderer.send('store:reveal')
  },
  clipboard: {
    write: (text: string): void => ipcRenderer.send('clipboard:write', text),
    read: (): Promise<string> => ipcRenderer.invoke('clipboard:read')
  },
  backup: {
    /** Renvoie le chemin choisi, ou `null` si l'utilisateur annule. */
    save: (contents: string): Promise<string | null> => ipcRenderer.invoke('backup:save', contents),
    load: (): Promise<BackupFile | null> => ipcRenderer.invoke('backup:load')
  },
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version')
  }
}

export type JToolsApi = typeof api

contextBridge.exposeInMainWorld('jtools', api)
