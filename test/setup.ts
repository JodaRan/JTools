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
    vault: {
      status: vi.fn().mockResolvedValue({ configured: false, unlocked: false }),
      create: vi.fn(),
      unlock: vi.fn(),
      unlockWithRecovery: vi.fn(),
      lock: noop,
      changePassphrase: vi.fn(),
      regenerateRecovery: vi.fn(),
      disable: vi.fn()
    },
    store: {
      readAll: vi.fn(),
      readUi: vi.fn(),
      write: vi.fn(),
      writeSync: vi.fn(),
      reveal: noop
    },
    clipboard: { write: vi.fn(), read: vi.fn().mockResolvedValue('') },
    backup: {
      save: vi.fn(),
      seal: vi.fn(async (contents: string) => contents),
      load: vi.fn(),
      openForeign: vi.fn()
    },
    file: { saveText: vi.fn(), openText: vi.fn().mockResolvedValue(null) },
    legacy: { pick: vi.fn().mockResolvedValue(null) },
    app: { getVersion: vi.fn().mockResolvedValue('0.0.0-test') }
  }
})
