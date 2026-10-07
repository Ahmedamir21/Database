import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The development server of the client.
 *
 * host: true            the server listens on 0.0.0.0, so it also works when it runs inside
 *                       a container or behind the preview proxy of the sandbox
 * allowedHosts: true    the preview proxy reaches the page with its own host name
 * server.proxy          /api is forwarded to the Express API, so the browser only ever talks
 *                       to one origin and the session cookie works without CORS
 *
 * When the project is handed in, "npm run build" writes client/dist and the Express server
 * serves those files itself: the whole application then runs on one port.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
