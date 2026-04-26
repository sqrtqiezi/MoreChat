import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    alias: {
      'onnxruntime-node': new URL('./test/mocks/onnxruntime-node.ts', import.meta.url).pathname
    }
  }
})
