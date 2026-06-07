import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Lightweight unit-test config for pure logic (zustand stores).
// node environment is sufficient — these stores have no DOM dependency
// (their localStorage side-effects are guarded behind `typeof window`).
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
