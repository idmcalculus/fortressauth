import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  base: '/vue-demo/',
  server: {
    port: 3002,
  },
  preview: {
    port: 3002,
  },
});
