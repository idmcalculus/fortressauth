import { AuthProvider } from '@fortressauth/vue-sdk';
import { createApp, h } from 'vue';
import App from './App.vue';


createApp({

  setup() {
    return () => h(AuthProvider, { baseUrl: 'http://localhost:5001' }, {
      default: () => h(App)
    });
  },
}).mount('#app');
