export type StoreName = 'data' | 'history' | 'ui'

const sources = new Map<StoreName, () => unknown>()
const timers = new Map<StoreName, number>()

const DEFAULT_DELAY = 400

/**
 * Coupe-circuit d'écriture. Coffre verrouillé, le processus principal refuse
 * d'écrire un fichier chiffrable — inutile de lui envoyer des demandes vouées
 * à échouer, et surtout inutile de sérialiser des données pour rien.
 */
let writable = true

export function setWritable(value: boolean): void {
  writable = value
}

/**
 * Un store déclare comment se sérialiser ; `scheduleSave` se charge du reste.
 * Le renderer est le seul écrivain des fichiers JSON : le processus principal
 * ne fait que lire au démarrage.
 */
export function registerSource(name: StoreName, serialize: () => unknown): void {
  sources.set(name, serialize)
}

/** Écriture différée : la frappe au kilomètre ne déclenche qu'une écriture. */
export function scheduleSave(name: StoreName, delay = DEFAULT_DELAY): void {
  const pending = timers.get(name)
  if (pending !== undefined) window.clearTimeout(pending)
  timers.set(
    name,
    window.setTimeout(() => {
      timers.delete(name)
      flush(name)
    }, delay)
  )
}

export function flush(name: StoreName, sync = false): void {
  const serialize = sources.get(name)
  if (!serialize) return
  // `ui.json` n'est jamais chiffré : il reste enregistrable coffre fermé,
  // sans quoi la géométrie de la fenêtre ne survivrait pas au verrouillage.
  if (!writable && name !== 'ui') return
  // Sérialisé ici : les états sont des proxies Vue, que le clonage structuré
  // de l'IPC refuse de transporter.
  const contents = JSON.stringify(serialize(), null, 2)
  if (sync) window.jtools.store.writeSync(name, contents)
  else window.jtools.store.write(name, contents)
}

export function flushAll(sync = false): void {
  for (const [name, timer] of timers) {
    window.clearTimeout(timer)
    timers.delete(name)
    flush(name, sync)
  }
}

// Filet de sécurité : la dernière frappe ne doit pas mourir avec la fenêtre.
// En écriture synchrone, sinon la fenêtre disparaît avant le message IPC.
window.addEventListener('beforeunload', () => flushAll(true))
