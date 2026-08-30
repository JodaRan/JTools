export interface Hotkey {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  /** Autorise le raccourci même quand le curseur est dans un champ de saisie. */
  inFields?: boolean
  run: (event: KeyboardEvent) => void
}

const isTextField = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null
  if (!el) return false
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.isContentEditable ||
    el.closest('input, textarea, [contenteditable="true"]') !== null
  )
}

/**
 * Un menu Naive ouvert (⋮ d'une ligne, clic droit sur un onglet) capte déjà le
 * clavier : Échap le ferme, les flèches le parcourent. Un raccourci global qui
 * partirait par-dessus donnerait l'impression que le menu a été ignoré.
 */
const isMenuOpen = (): boolean => document.querySelector('.n-dropdown') !== null

/**
 * Raccourcis d'application, posés une seule fois sur la fenêtre. Par défaut ils
 * s'effacent devant un champ de saisie : dans un texte, Ctrl+Z doit d'abord
 * annuler la frappe, pas la dernière action métier.
 */
export function registerHotkeys(hotkeys: Hotkey[]): () => void {
  const handler = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase()
    for (const hotkey of hotkeys) {
      if (key !== hotkey.key.toLowerCase()) continue
      if (!!hotkey.ctrl !== (event.ctrlKey || event.metaKey)) continue
      if (!!hotkey.shift !== event.shiftKey) continue
      if (!!hotkey.alt !== event.altKey) continue
      if (!hotkey.inFields && isTextField(event.target)) continue
      if (!hotkey.inFields && isMenuOpen()) continue
      event.preventDefault()
      hotkey.run(event)
      return
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}
