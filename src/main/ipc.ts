import { app, clipboard, dialog, ipcMain, nativeTheme, shell, type BrowserWindow } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { readAll, storageDir, writeStore, type StoreName } from './storage'
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

  // — Stockage —
  ipcMain.handle('store:read-all', () => readAll())
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
  ipcMain.handle('backup:save', async (_e, contents: string) => {
    const win = getWindow()
    const stamp = new Date().toISOString().slice(0, 10)
    const { canceled, filePath } = await dialog.showSaveDialog(win!, {
      title: 'Exporter la sauvegarde JTools',
      defaultPath: `jtools-${stamp}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (canceled || !filePath) return null
    await writeFile(filePath, contents, 'utf-8')
    return filePath
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
