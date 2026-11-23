import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { cspInterface } from './vite-csp'

// electron-vite 6 externalise les dépendances de main et preload par défaut (build.externalizeDeps).
export default defineConfig({
  main: {},
  // ARB-160 : le preload sandboxé ne peut rien `require` hors d'electron ; `browser-action` de la bibliothèque y est embarqué.
  preload: { build: { externalizeDeps: { exclude: ['electron-chrome-extensions'] } } },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), cspInterface()]
  }
})
