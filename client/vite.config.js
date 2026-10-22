import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the React app (port 5173) talks to the Express API (port 5000)
// through this proxy, so the browser sees a single origin and needs no CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': process.env.VITE_API_PROXY_TARGET || 'http://localhost:5000',
    },
  },
});
