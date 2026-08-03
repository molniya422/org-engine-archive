import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? './' : '/',
  plugins: [react()],
  resolve: {
    // Prefer TS/TSX over stale compiled .js siblings (e.g. router.js vs router.tsx).
    // Without this, Vite may pick outdated createBrowserRouter builds and drop routes.
    extensions: ['.mjs', '.mts', '.ts', '.tsx', '.jsx', '.js', '.json'],
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.VITE_PROXY_TARGET || 'http://localhost:5172', changeOrigin: true },
      '/ws': { target: (process.env.VITE_PROXY_TARGET || 'http://localhost:5172').replace('http', 'ws'), ws: true },
    },
  },
});
