import { onBeforeUnmount, onMounted, watch } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useVaultStore } from '@/stores/vault'

/**
 * Referme le coffre après un temps sans activité.
 *
 * C'est le seul contrepoids sérieux à « le mot de passe n'est demandé qu'au
 * démarrage » : une machine laissée allumée n'expose alors ses données que le
 * temps du délai, au lieu de la journée entière.
 *
 * Le compteur n'est armé que coffre ouvert — sans chiffrement, il n'y aurait
 * rien à refermer.
 */
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'pointermove'] as const

/** Le suivi du pointeur est bridé : inutile de réarmer à chaque pixel. */
const THROTTLE_MS = 1000

export function useIdleLock(): void {
  const ui = useUiStore()
  const vault = useVaultStore()

  let timer: number | undefined
  let lastPing = 0

  function clear(): void {
    if (timer !== undefined) window.clearTimeout(timer)
    timer = undefined
  }

  function arm(): void {
    clear()
    const minutes = ui.security.idleLockMinutes
    if (!vault.active || minutes <= 0) return
    timer = window.setTimeout(() => vault.lock(), minutes * 60_000)
  }

  function onActivity(): void {
    const now = Date.now()
    if (now - lastPing < THROTTLE_MS) return
    lastPing = now
    arm()
  }

  onMounted(() => {
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true })
    }
    arm()
  })

  onBeforeUnmount(() => {
    clear()
    for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity)
  })

  // Changer le délai, ou ouvrir le coffre, doit réarmer immédiatement.
  watch(() => [vault.active, ui.security.idleLockMinutes], arm)
}
