import { defineConfig } from 'electron-vite'
import upstream from './electron.vite.config'

// Rebuild only the UI. Keep the installed 0.1.26 main and preload bundles intact.
export default defineConfig(async (env) => {
  const config = typeof upstream === 'function' ? await upstream(env) : await upstream
  return { renderer: config.renderer }
})
