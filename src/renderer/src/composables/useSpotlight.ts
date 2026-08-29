import { ref, type Ref } from 'vue'

/**
 * Met brièvement une ligne en évidence. Sans ça, une annulation faite depuis
 * un autre onglet n'aurait aucun effet visible : on saurait que quelque chose
 * est revenu, sans voir quoi.
 */
const spotlightId = ref<string | null>(null)
let timer: number | undefined

const HIGHLIGHT_MS = 1600

export function useSpotlight(): {
  spotlightId: Ref<string | null>
  spot: (id: string) => Promise<void>
} {
  /** Fait défiler jusqu'à l'élément puis l'entoure d'un halo. */
  async function spot(id: string): Promise<void> {
    spotlightId.value = id
    window.clearTimeout(timer)

    // Laisse le temps à la vue cible de se monter avant de chercher la ligne.
    await new Promise((resolve) => window.setTimeout(resolve, 60))
    document
      .querySelector(`[data-test-line="${id}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })

    timer = window.setTimeout(() => {
      spotlightId.value = null
    }, HIGHLIGHT_MS)
  }

  return { spotlightId, spot }
}
