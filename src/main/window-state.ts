import { screen, type BrowserWindow } from 'electron'
import { DEFAULT_WINDOW, type WindowState } from '../shared/models'

/**
 * Ramène des bornes enregistrées dans un écran réellement présent : sans ça,
 * débrancher un second moniteur rouvrirait la fenêtre hors champ.
 */
export function sanitizeBounds(state: Partial<WindowState> | undefined): WindowState {
  const width = Math.max(720, Math.round(state?.width ?? DEFAULT_WINDOW.width))
  const height = Math.max(480, Math.round(state?.height ?? DEFAULT_WINDOW.height))
  const result: WindowState = {
    x: null,
    y: null,
    width,
    height,
    maximized: state?.maximized ?? false
  }

  if (state?.x == null || state?.y == null) return result

  const x = Math.round(state.x)
  const y = Math.round(state.y)
  // La barre de titre doit rester attrapable : on exige que le coin haut-gauche
  // tombe dans une zone de travail existante.
  const visible = screen.getAllDisplays().some(({ workArea }) => {
    return (
      x >= workArea.x - width + 120 &&
      x <= workArea.x + workArea.width - 120 &&
      y >= workArea.y &&
      y <= workArea.y + workArea.height - 40
    )
  })

  if (visible) {
    result.x = x
    result.y = y
  }
  return result
}

/**
 * Signale au renderer toute évolution de la géométrie. Le renderer reste le
 * seul écrivain de ui.json, ce qui évite deux processus concurrents sur le
 * même fichier.
 */
export function trackWindow(win: BrowserWindow, onChange: (state: WindowState) => void): void {
  let timer: NodeJS.Timeout | undefined

  const publish = (): void => {
    if (win.isDestroyed()) return
    const maximized = win.isMaximized()
    // En mode agrandi, `getBounds()` renvoie la taille plein écran : on garde
    // les bornes normales pour pouvoir restaurer la fenêtre à sa taille.
    const bounds = maximized ? win.getNormalBounds() : win.getBounds()
    onChange({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, maximized })
  }

  const schedule = (): void => {
    clearTimeout(timer)
    timer = setTimeout(publish, 300)
  }

  win.on('resize', schedule)
  win.on('move', schedule)
  win.on('maximize', publish)
  win.on('unmaximize', publish)
  win.on('close', () => clearTimeout(timer))
}
