import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Firebase und React in eigene, langlebige Chunks auslagern —
        // sie ändern sich selten und bleiben so im Browser-Cache.
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
          react: ['react', 'react-dom', 'react-router-dom']
        }
      }
    }
  },
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      '@': '/src'
    }
  },
})

