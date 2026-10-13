import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0', // Aceita conexões externas
    proxy: {
      '/api': {
        target: 'http://localhost:7771',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:7771',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../web-dist',
    emptyOutDir: true,
  },
  base: '', // Caminhos relativos para funcionar em qualquer lugar
});
