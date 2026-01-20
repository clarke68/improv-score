import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { BASE_PATH } from './config/base-path.js';

export default defineConfig({
  plugins: [sveltekit()],
  base: `${BASE_PATH}/`,
  server: {
    host: '0.0.0.0', // Allow access from local network
    port: 5173
  }
});


