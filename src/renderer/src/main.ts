import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { hydrateStores } from './lib/bootstrap'
import { initialRoute, installNavigationSync } from './lib/navigation'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)

async function start(): Promise<void> {
  // L'état est lu avant le montage : la fenêtre s'ouvre déjà dans le bon thème,
  // sur le bon onglet, sans transition visible.
  await hydrateStores()
  installNavigationSync(router)
  await router.replace(initialRoute())
  await router.isReady()
  app.mount('#app')
}

void start()
