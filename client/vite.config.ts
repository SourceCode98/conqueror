import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-motion': ['motion/react'],
          'vendor-i18n': ['react-i18next', 'i18next'],
          'vendor-router': ['react-router-dom'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@conqueror/shared': path.resolve(__dirname, '../shared/dist/index.js'),
    },
    conditions: ['import', 'module', 'browser', 'default'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:3001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
