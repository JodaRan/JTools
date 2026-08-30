import type { Router } from 'vue-router'
import { hydrateData } from '@/lib/bootstrap'
import { initialRoute, installNavigationSync } from '@/lib/navigation'
import { useVaultStore } from '@/stores/vault'

/**
 * Ouvre la session de travail : charge la donnée métier puis place le routeur
 * là où l'utilisateur s'était arrêté.
 *
 * Appelée au démarrage sans coffre, ou juste après un déverrouillage — d'où
 * le garde sur la synchronisation des onglets, qui ne doit être posée qu'une
 * fois pour la vie du processus.
 */
let navigationInstalled = false

export async function startSession(router: Router): Promise<boolean> {
  const vault = useVaultStore()

  if (!(await hydrateData())) return false

  if (!navigationInstalled) {
    installNavigationSync(router)
    navigationInstalled = true
  }

  await router.replace(initialRoute())
  await router.isReady()
  vault.sessionReady = true
  return true
}
