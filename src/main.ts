import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import './assets/base.css'
import App from './App.vue'
import router from './router'
import { useAuthStore } from '@/stores/auth'

const app = createApp(App)
app.use(createPinia())
app.use(router)

const auth = useAuthStore()
if (auth.token) {
  auth.refreshProfile().catch(() => auth.clear())
}

app.mount('#app')
