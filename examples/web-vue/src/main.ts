import { AuthProvider } from '@fortressauth/vue-sdk';
import { createApp, h } from 'vue';
import App from './App.vue';

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

createApp({
  render() {
    return h(AuthProvider, { baseUrl }, { default: () => h(App) });
  },
}).mount('#app');
