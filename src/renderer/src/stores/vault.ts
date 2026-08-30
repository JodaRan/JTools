import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { flushAll, setWritable } from '@/lib/persist'
import { useDataStore } from '@/stores/data'
import { useHistoryStore } from '@/stores/history'
import { useUndoStore } from '@/stores/undo'
import { defaultData, defaultHistory } from '@shared/models'

/**
 * Reflet côté interface de l'état du coffre. La clé, elle, ne quitte jamais le
 * processus principal : ce store ne manipule que des passphrases de passage et
 * des booléens.
 */
export type GateState = 'boot' | 'setup' | 'locked' | 'error' | 'open'

export const useVaultStore = defineStore('vault', () => {
  const configured = ref(false)
  const unlocked = ref(false)
  /** Vrai une fois les données métier chargées et le routeur prêt. */
  const sessionReady = ref(false)
  const failure = ref<'undecipherable' | null>(null)
  /** Renseigné juste après création ou régénération, à montrer une seule fois. */
  const freshRecoveryKey = ref<string | null>(null)
  const offerSetup = ref(false)

  const gate = computed<GateState>(() => {
    if (failure.value) return 'error'
    if (configured.value && !unlocked.value) return 'locked'
    if (offerSetup.value) return 'setup'
    return sessionReady.value ? 'open' : 'boot'
  })

  /** Le coffre protège-t-il effectivement le stockage en ce moment ? */
  const active = computed(() => configured.value && unlocked.value)

  async function refresh(): Promise<void> {
    const status = await window.jtools.vault.status()
    configured.value = status.configured
    unlocked.value = status.unlocked
    setWritable(!status.configured || status.unlocked)
  }

  async function unlock(passphrase: string): Promise<boolean> {
    const result = await window.jtools.vault.unlock(passphrase)
    if (result.ok) await refresh()
    return result.ok
  }

  async function unlockWithRecovery(key: string): Promise<boolean> {
    const result = await window.jtools.vault.unlockWithRecovery(key)
    if (result.ok) await refresh()
    return result.ok
  }

  async function create(passphrase: string): Promise<string> {
    const { recoveryKey } = await window.jtools.vault.create(passphrase)
    await refresh()
    freshRecoveryKey.value = recoveryKey
    offerSetup.value = false
    return recoveryKey
  }

  /**
   * Verrouille. L'ordre est impératif : purger les écritures en attente tant
   * que la clé existe encore, sinon la dernière frappe est perdue — le
   * processus principal refuse d'écrire un fichier chiffrable sans clé.
   *
   * Les stores sont ensuite vidés. Sans ça, refermer le coffre ne ferait que
   * masquer l'affichage : le contenu déchiffré resterait dans la mémoire du
   * renderer, à la portée de qui sait s'y attacher — ce qui viderait le
   * verrouillage sur inactivité de son intérêt.
   */
  function lock(): void {
    flushAll(true)
    setWritable(false)
    window.jtools.vault.lock()

    useDataStore().hydrate(defaultData())
    useHistoryStore().hydrate(defaultHistory())
    // La pile d'annulation retient des valeurs dans ses fermetures, et ne
    // décrirait de toute façon plus l'état rechargé au déverrouillage.
    useUndoStore().reset()

    unlocked.value = false
    sessionReady.value = false
  }

  async function changePassphrase(current: string, next: string): Promise<boolean> {
    const { ok } = await window.jtools.vault.changePassphrase(current, next)
    return ok
  }

  async function regenerateRecovery(passphrase: string): Promise<string | null> {
    const { ok, recoveryKey } = await window.jtools.vault.regenerateRecovery(passphrase)
    if (!ok || !recoveryKey) return null
    freshRecoveryKey.value = recoveryKey
    return recoveryKey
  }

  async function disable(passphrase: string): Promise<boolean> {
    // Les données sont réécrites en clair côté principal avant que la clé ne
    // disparaisse ; il faut donc que rien ne soit en attente d'écriture.
    flushAll(true)
    const { ok } = await window.jtools.vault.disable(passphrase)
    if (ok) await refresh()
    return ok
  }

  return {
    configured,
    unlocked,
    sessionReady,
    failure,
    freshRecoveryKey,
    offerSetup,
    gate,
    active,
    refresh,
    unlock,
    unlockWithRecovery,
    create,
    lock,
    changePassphrase,
    regenerateRecovery,
    disable
  }
})
