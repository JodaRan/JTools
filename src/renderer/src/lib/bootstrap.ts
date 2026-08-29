import { useDataStore } from '@/stores/data'
import { useHistoryStore } from '@/stores/history'
import { useTabsStore } from '@/stores/tabs'
import { useUiStore } from '@/stores/ui'
import { migrateData, migrateHistory, migrateUi } from '@/lib/migrate'

/**
 * Charge les fichiers JSON avant le premier rendu : le thème, la géométrie et
 * les onglets doivent être connus d'emblée pour éviter tout clignotement.
 */
export async function hydrateStores(): Promise<void> {
  const ui = useUiStore()
  const data = useDataStore()
  const history = useHistoryStore()

  try {
    const files = await window.jtools.store.readAll()
    ui.hydrate(migrateUi(files.ui))
    data.hydrate(migrateData(files.data))
    history.hydrate(migrateHistory(files.history))
  } catch (err) {
    // Un stockage illisible ne doit pas empêcher l'app de s'ouvrir vide.
    console.error('[bootstrap] chargement impossible, démarrage à vide', err)
  }

  // Un onglet dont la séquence a disparu entre deux sessions n'a plus lieu d'être.
  useTabsStore().prune()

  await ui.init()
}
