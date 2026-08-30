import { app, clipboard, dialog, ipcMain, nativeTheme, shell, type BrowserWindow } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import {
  StorageError,
  readAll,
  readStore,
  restoreSnapshot,
  snapshotStores,
  storageDir,
  writeStore,
  type StoreName
} from './storage'
import * as vault from './vault'
import { seal, type Sealed } from './crypto'
import type { ThemeMode } from '../shared/models'

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  // — Fenêtre (chrome maison, fenêtre frameless) —
  ipcMain.on('window:minimize', () => getWindow()?.minimize())
  ipcMain.on('window:toggle-maximize', () => {
    const win = getWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('window:close', () => getWindow()?.close())
  ipcMain.handle('window:is-maximized', () => getWindow()?.isMaximized() ?? false)

  // — Thème —
  ipcMain.on('theme:set-source', (_e, source: ThemeMode) => {
    nativeTheme.themeSource = source
  })
  ipcMain.handle('theme:should-use-dark', () => nativeTheme.shouldUseDarkColors)

  // — Coffre —
  ipcMain.handle('vault:status', () => ({
    configured: vault.isConfigured(),
    unlocked: vault.isUnlocked()
  }))

  /**
   * Activation. Les fichiers sont relus en clair avant que la clé n'existe,
   * puis réécrits chiffrés : c'est ce qui migre un stockage existant.
   */
  ipcMain.handle('vault:create', async (_e, passphrase: string) => {
    const snapshot = await snapshotStores()
    const { recoveryKey } = await vault.create(passphrase)
    restoreSnapshot(snapshot)
    return { ok: true as const, recoveryKey }
  })

  ipcMain.handle('vault:unlock', (_e, passphrase: string) => vault.unlock(passphrase))
  ipcMain.handle('vault:unlock-recovery', (_e, key: string) => vault.unlockWithRecovery(key))
  ipcMain.on('vault:lock', () => vault.lock())

  ipcMain.handle('vault:change-passphrase', (_e, current: string, next: string) =>
    vault.changePassphrase(current, next)
  )
  ipcMain.handle('vault:regenerate-recovery', (_e, passphrase: string) =>
    vault.regenerateRecoveryKey(passphrase)
  )

  /** Désactivation : relire pendant qu'on a encore la clé, puis réécrire en clair. */
  ipcMain.handle('vault:disable', async (_e, passphrase: string) => {
    const snapshot = await snapshotStores()
    const result = await vault.disable(passphrase)
    if (result.ok) restoreSnapshot(snapshot)
    return result
  })

  // — Stockage —
  /**
   * Résultat étiqueté plutôt qu'une exception : un fichier chiffré qu'on ne
   * sait pas ouvrir doit remonter jusqu'à l'écran, surtout pas être confondu
   * avec un stockage vide — le renderer réécrirait par-dessus.
   */
  /**
   * `ui.json` est lisible coffre fermé : c'est lui qui porte le thème et la
   * géométrie, dont l'écran de déverrouillage a besoin pour s'afficher juste.
   */
  ipcMain.handle('store:read-ui', () => readStore('ui'))

  ipcMain.handle('store:read-all', async () => {
    try {
      return { ok: true as const, files: await readAll() }
    } catch (err) {
      const code = err instanceof StorageError ? err.code : 'undecipherable'
      return { ok: false as const, code }
    }
  })
  ipcMain.on('store:write', (_e, name: StoreName, contents: string) => {
    try {
      writeStore(name, contents)
    } catch (err) {
      console.error(`[storage] écriture de ${name} impossible`, err)
    }
  })
  // Purge de dernière seconde : appelée depuis `beforeunload`, elle doit être
  // traitée avant que la fenêtre ne disparaisse — d'où le canal synchrone.
  ipcMain.on('store:write-sync', (event, name: StoreName, contents: string) => {
    try {
      writeStore(name, contents)
    } catch (err) {
      console.error(`[storage] écriture finale de ${name} impossible`, err)
    }
    event.returnValue = true
  })
  ipcMain.on('store:reveal', () => void shell.openPath(storageDir()))

  // — Presse-papiers —
  ipcMain.on('clipboard:write', (_e, text: string) => clipboard.writeText(text))
  ipcMain.handle('clipboard:read', () => clipboard.readText())

  // — Sauvegarde / restauration —
  /**
   * Enveloppe d'export. Quand le coffre est actif, la sauvegarde emporte le
   * matériel de clé : elle s'ouvre alors sur n'importe quelle machine avec la
   * passphrase — ou la clé de secours — en vigueur au moment de l'export.
   */
  const sealBackup = (contents: string): string => {
    const key = vault.currentKey()
    const file = vault.exportVaultFile()
    if (!key || !file) return contents
    return JSON.stringify(
      {
        app: 'JTools',
        jtools: 'encrypted',
        v: 1,
        exportedAt: new Date().toISOString(),
        vault: file,
        payload: seal(key, contents)
      },
      null,
      2
    )
  }

  ipcMain.handle('backup:save', async (_e, contents: string) => {
    const win = getWindow()
    const stamp = new Date().toISOString().slice(0, 10)
    const { canceled, filePath } = await dialog.showSaveDialog(win!, {
      title: 'Exporter la sauvegarde JTools',
      defaultPath: `jtools-${stamp}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (canceled || !filePath) return null
    await writeFile(filePath, sealBackup(contents), 'utf-8')
    return filePath
  })

  /**
   * Écriture en clair, hors coffre. Sert à la clé de secours : la chiffrer
   * avec le coffre qu'elle est censée ouvrir n'aurait aucun sens.
   */
  ipcMain.handle('file:save-text', async (_e, defaultName: string, contents: string) => {
    const win = getWindow()
    const { canceled, filePath } = await dialog.showSaveDialog(win!, {
      title: 'Enregistrer',
      defaultPath: defaultName,
      filters: [{ name: 'Texte', extensions: ['txt'] }]
    })
    if (canceled || !filePath) return null
    await writeFile(filePath, contents, 'utf-8')
    return filePath
  })

  /** Chiffre une sauvegarde destinée au presse-papiers, comme pour un fichier. */
  ipcMain.handle('backup:seal', (_e, contents: string) => sealBackup(contents))

  /**
   * Ouvre une sauvegarde chiffrée venue d'ailleurs. `secret` accepte aussi
   * bien la passphrase du poste d'origine que sa clé de secours.
   */
  ipcMain.handle('backup:open-foreign', async (_e, envelope: unknown, secret: string) => {
    const file = envelope as { vault: vault.VaultFile; payload: Sealed }
    try {
      const plain = await vault.openForeign(file.vault, secret, file.payload)
      return plain ? { ok: true as const, backup: JSON.parse(plain.toString('utf-8')) } : null
    } catch {
      return null
    }
  })

  ipcMain.handle('backup:load', async () => {
    const win = getWindow()
    const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
      title: 'Importer une sauvegarde JTools',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (canceled || filePaths.length === 0) return null
    return JSON.parse(await readFile(filePaths[0], 'utf-8'))
  })

  ipcMain.handle('app:get-version', () => app.getVersion())
}
