// vitest/config rather than vite: defineConfig from `vite` has no `test` key.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Lets the browser call /api same-origin against the real backend in dev,
  // without needing a CORS policy in Program.cs. See api/index.ts's swap point.
  server: { port: 5273, proxy: { '/api': 'http://localhost:5274' } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    restoreMocks: true,
  },
})
