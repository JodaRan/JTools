import { vi } from 'vitest'

/**
 * Le renderer parle au processus principal par `window.jtools`. En test il n'y
 * a pas d'Electron : on pose un double inerte pour que les stores puissent
 * s'importer et enregistrer leur sérialisation sans rien écrire sur le disque.
 */
const noop = (): void => undefined

Object.defineProperty(window, 'jtools', {
  writable: true,
  value: {
    window: {
      minimize: noop,
      toggleMaximize: noop,
      close: noop,
      isMaximized: vi.fn().mockResolvedValue(false),
      onMaximizedChange: () => noop,
      onStateChange: () => noop
    },
    theme: {
      setSource: noop,
      shouldUseDark: vi.fn().mockResolvedValue(false),
      onChange: () => noop
    },
    store: {
      readAll: vi.fn(),
      write: vi.fn(),
      writeSync: vi.fn(),
      reveal: noop
    },
    clipboard: { write: vi.fn(), read: vi.fn().mockResolvedValue('') },
    backup: { save: vi.fn(), load: vi.fn() },
    app: { getVersion: vi.fn().mockResolvedValue('0.0.0-test') }
  }
})
