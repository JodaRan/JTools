import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { hydrateUi } from './lib/bootstrap'
import { startSession } from './lib/session'
import { useUiStore } from './stores/ui'
import { useVaultStore } from './stores/vault'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)

async function start(): Promise<void> {
  const vault = useVaultStore()
  await vault.refresh()

  // `ui.json` n'est jamais chiffré : le thème et la géométrie sont connus
  // d'emblée, donc l'écran de déverrouillage s'affiche déjà aux bonnes
  // couleurs, sans clignotement.
  await hydrateUi()

  if (vault.configured) {
    // Le reste attend la passphrase (voir `VaultGate`).
    app.mount('#app')
    return
  }

  // Pas de coffre : on entre directement. La proposition d'en créer un n'est
  // faite qu'une seule fois, le chiffrement étant facultatif.
  if (!useUiStore().security.prompted) vault.offerSetup = true
  await startSession(router)
  app.mount('#app')
}

void start()
