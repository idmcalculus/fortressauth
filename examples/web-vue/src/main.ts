import { AuthProvider } from '@fortressauth/vue-sdk';
import { createApp, h } from 'vue';
import App from './App.vue';

const baseUrl = '';

createApp({
  render() {
    return h(AuthProvider, { baseUrl }, { default: () => h(App) });
  },
}).mount('#app');
