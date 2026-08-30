import { contextBridge, ipcRenderer } from 'electron'
import type {
  BackupFile,
  EncryptedBackup,
  DataFile,
  HistoryFile,
  ThemeMode,
  UiFile,
  WindowState
} from '../shared/models'

type StoreName = 'data' | 'history' | 'ui'

export type VaultStatus = { configured: boolean; unlocked: boolean }

export type UnlockResult =
  | { ok: true }
  | { ok: false; reason: 'no-vault' | 'bad-passphrase' | 'bad-recovery' | 'unreadable' }

export type ReadAllResult =
  | { ok: true; files: { data: DataFile; history: HistoryFile; ui: UiFile } }
  | { ok: false; code: 'locked' | 'undecipherable' }

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
  vault: {
    status: (): Promise<VaultStatus> => ipcRenderer.invoke('vault:status'),
    /** Active le coffre et chiffre le stockage existant. Rend la clé de secours. */
    create: (passphrase: string): Promise<{ ok: true; recoveryKey: string }> =>
      ipcRenderer.invoke('vault:create', passphrase),
    unlock: (passphrase: string): Promise<UnlockResult> =>
      ipcRenderer.invoke('vault:unlock', passphrase),
    unlockWithRecovery: (key: string): Promise<UnlockResult> =>
      ipcRenderer.invoke('vault:unlock-recovery', key),
    /** Efface la clé côté principal. Purger les écritures en attente AVANT. */
    lock: (): void => ipcRenderer.send('vault:lock'),
    changePassphrase: (current: string, next: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('vault:change-passphrase', current, next),
    regenerateRecovery: (
      passphrase: string
    ): Promise<{ ok: boolean; recoveryKey?: string }> =>
      ipcRenderer.invoke('vault:regenerate-recovery', passphrase),
    disable: (passphrase: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('vault:disable', passphrase)
  },
  store: {
    readAll: (): Promise<ReadAllResult> => ipcRenderer.invoke('store:read-all'),
    /** Lisible même coffre fermé : thème, géométrie, onglets. */
    readUi: (): Promise<UiFile> => ipcRenderer.invoke('store:read-ui'),
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
    /** Chiffre une sauvegarde destinée au presse-papiers, si le coffre est actif. */
    seal: (contents: string): Promise<string> => ipcRenderer.invoke('backup:seal', contents),
    load: (): Promise<BackupFile | EncryptedBackup | null> =>
      ipcRenderer.invoke('backup:load'),
    /** Ouvre une sauvegarde chiffrée venue d'un autre poste. */
    openForeign: (
      envelope: EncryptedBackup,
      secret: string
    ): Promise<{ ok: true; backup: BackupFile } | null> =>
      ipcRenderer.invoke('backup:open-foreign', envelope, secret)
  },
  file: {
    /** Enregistre du texte en clair, sans passer par le coffre. */
    saveText: (defaultName: string, contents: string): Promise<string | null> =>
      ipcRenderer.invoke('file:save-text', defaultName, contents)
  },
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version')
  }
}

export type JToolsApi = typeof api

contextBridge.exposeInMainWorld('jtools', api)
