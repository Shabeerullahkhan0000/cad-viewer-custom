import 'element-plus/dist/index.css'

import ElementPlus from 'element-plus'
import { createApp } from 'vue'

import { i18n } from '../../cad-viewer/src/locale/i18n'
import App from './App.vue'

const initApp = () => {
  const app = createApp(App)
  app.use(i18n)
  app.use(ElementPlus)
  app.mount('#app')

  // Hide the loading spinner
  const loader = document.getElementById('loader')
  if (loader) {
    loader.style.display = 'none'
  }
}

initApp()
