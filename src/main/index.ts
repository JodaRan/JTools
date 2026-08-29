import { app, BrowserWindow, nativeTheme, shell } from 'electron'
import { join } from 'node:path'
import { readStore } from './storage'
import { sanitizeBounds, trackWindow } from './window-state'
import { registerIpc } from './ipc'
import type { UiFile } from '../shared/models'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null

async function createWindow(): Promise<void> {
  // La géométrie est relue ici plutôt que dans le renderer : la fenêtre doit
  // naître à la bonne taille, pas être redimensionnée après coup.
  const ui = (await readStore('ui')) as UiFile
  const bounds = sanitizeBounds(ui?.window)
  const startDark = ui?.theme === 'dark' || (ui?.theme !== 'light' && nativeTheme.shouldUseDarkColors)

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    ...(bounds.x !== null && bounds.y !== null ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: 720,
    minHeight: 480,
    show: false,
    frame: false,
    // En production l'icône vient de l'exécutable ; en dev il faut la donner
    // pour que la barre des tâches n'affiche pas celle d'Electron.
    ...(isDev ? { icon: join(__dirname, '../../build/icon.png') } : {}),
    backgroundColor: startDark ? '#101014' : '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (bounds.maximized) mainWindow.maximize()

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // Les liens externes s'ouvrent dans le navigateur, jamais dans une fenêtre Electron.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const notifyMaximized = (): void =>
    mainWindow?.webContents.send('window:maximized-changed', mainWindow.isMaximized())
  mainWindow.on('maximize', notifyMaximized)
  mainWindow.on('unmaximize', notifyMaximized)

  trackWindow(mainWindow, (state) => {
    mainWindow?.webContents.send('window:state-changed', state)
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Une seule instance : un second lancement réveille la fenêtre existante.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(async () => {
    registerIpc(() => mainWindow)
    await createWindow()

    nativeTheme.on('updated', () => {
      mainWindow?.webContents.send('theme:changed', nativeTheme.shouldUseDarkColors)
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
