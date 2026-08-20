import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' -> build statis bisa jalan di sub-path GitHub Pages (repo.github.io/uno-duel/)
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: true,
    port: 5173
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900
  }
})
