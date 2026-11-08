import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the browser talks to the Vite dev server (same origin) and Vite forwards
// /api/* to the backend. This avoids CORS problems entirely (localhost vs 127.0.0.1,
// Vite moving to port 5174, etc.). Change VITE_PROXY_TARGET if your backend uses another port.
const backend = process.env.VITE_PROXY_TARGET || 'http://localhost:5000';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: backend,
        changeOrigin: true,
        // AI calls can take a while; never let the dev proxy hang forever or hide the reason.
        timeout: 130000,
        proxyTimeout: 130000,
        configure: (proxy) => {
          proxy.on('error', (error, req, res) => {
            if (res && typeof res.writeHead === 'function' && !res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: false,
                message: `Cannot reach the backend at ${backend} (${error.code || error.message}). Make sure it is running (npm run dev in the server folder).`,
              }));
            }
          });
        },
      },
    },
  },
});
