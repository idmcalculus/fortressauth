/**
 * FortressAuth Vue Example - Main Entry Point
 * Configures the Vue application with FortressAuth authentication provider.
 */

import { AuthProvider } from '@fortressauth/vue-sdk';
import { createApp, h } from 'vue';
import App from './App.vue';
import './app.css';

// Use environment variable for API URL, with fallback for development
const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';

createApp({
  setup() {
    return () =>
      h(
        AuthProvider,
        { baseUrl: apiUrl },
        {
          default: () => h(App),
        },
      );
  },
}).mount('#app');
