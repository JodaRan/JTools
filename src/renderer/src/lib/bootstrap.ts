import { useDataStore } from '@/stores/data'
import { useHistoryStore } from '@/stores/history'
import { useTabsStore } from '@/stores/tabs'
import { useUiStore } from '@/stores/ui'
import { useVaultStore } from '@/stores/vault'
import { migrateData, migrateHistory, migrateUi } from '@/lib/migrate'

/**
 * Le démarrage se fait en deux temps à cause du coffre.
 *
 * `hydrateUi` ne lit que `ui.json`, qui n'est jamais chiffré : thème, taille de
 * fenêtre et onglets sont donc connus avant même que la passphrase soit
 * demandée, et l'écran de déverrouillage s'affiche déjà aux bonnes couleurs.
 *
 * `hydrateData` ne vient qu'ensuite, une fois le coffre ouvert — ou tout de
 * suite s'il n'y a pas de coffre.
 */
export async function hydrateUi(): Promise<void> {
  const ui = useUiStore()
  try {
    ui.hydrate(migrateUi(await window.jtools.store.readUi()))
  } catch (err) {
    console.error('[bootstrap] ui.json illisible, réglages par défaut', err)
  }
  await ui.init()
}

/**
 * Charge la donnée métier. Renvoie `false` si le stockage est chiffré et
 * illisible — auquel cas il ne faut surtout rien hydrater : les stores
 * partiraient à vide et la première sauvegarde écraserait le fichier.
 */
export async function hydrateData(): Promise<boolean> {
  const data = useDataStore()
  const history = useHistoryStore()
  const vault = useVaultStore()

  const result = await window.jtools.store.readAll()

  if (!result.ok) {
    if (result.code === 'undecipherable') vault.failure = 'undecipherable'
    return false
  }

  data.hydrate(migrateData(result.files.data))
  history.hydrate(migrateHistory(result.files.history))

  // Un onglet dont la séquence a disparu entre deux sessions n'a plus lieu d'être.
  useTabsStore().prune()
  return true
}
