import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/renderer/src/terminal/MarkdownStyler.ts',
        'src/renderer/src/terminal/CellGrid.ts',
        'src/main/git/**/*.ts',
        'src/renderer/src/git/**/*.ts',
      ],
      reporter: ['text', 'text-summary'],
    },
  },
})
