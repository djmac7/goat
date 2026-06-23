import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Mobile-first single-page game. Static data is served from /public/data
// (synced from ../data by scripts/sync-data.mjs). No backend.
// Relative base ('./') in production so the static build works under any path
// (e.g. GitHub Pages project sites at /<repo>/) without knowing the repo name.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [react()],
  server: { port: 5180, open: false },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
  },
}))
