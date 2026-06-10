import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev-Proxy-Ziel (Backend). Override per VITE_API_PROXY.
const proxyTarget = process.env.VITE_API_PROXY ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  // relative Pfade, damit die App auch via file:// (Capacitor/APK) lädt
  base: './',
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: proxyTarget, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
