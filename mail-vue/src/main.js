import {createApp} from 'vue';
import App from './App.vue';
import router from './router';
import './style.css';
import { init } from '@/init/init.js';
import { createPinia } from 'pinia';
import piniaPersistedState from 'pinia-plugin-persistedstate';
import 'element-plus/theme-chalk/dark/css-vars.css';
import 'nprogress/nprogress.css';
import perm from "@/perm/perm.js";
const pinia = createPinia().use(piniaPersistedState)
import i18n from "@/i18n/index.js";
const app = createApp(App).use(pinia)
async function start() {
    const hadToken = !!localStorage.getItem('token')
    try {
        await init()
        app.use(router).use(i18n).directive('perm', perm)
        app.mount('#app')
    } catch {
        if (hadToken && !localStorage.getItem('token')) return start()
        document.getElementById('loading-first')?.remove()
        const root = document.getElementById('app')
        const status = document.createElement('div')
        status.className = 'startup-error'
        status.setAttribute('role', 'alert')
        const message = document.createElement('p')
        message.textContent = i18n.global.t('loadFailed')
        const retry = document.createElement('button')
        retry.textContent = i18n.global.t('retry')
        retry.onclick = () => window.location.reload()
        status.append(message, retry)
        root.replaceChildren(status)
    }
}

await start()
