import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import path from 'path'

export default defineConfig({
  plugins: [
    dts({ 
      include: ['src/**/*.ts'],
      outDir: 'dist'
    })
  ],
  build: {
    target: 'esnext',
    sourcemap: true,
    minify: false,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index'
    }
  },
  resolve: {
    alias: {
      '@rpgjs/testing': path.resolve(__dirname, '../testing/src'),
      '@rpgjs/common': path.resolve(__dirname, '../common/src'),
      '@rpgjs/server': path.resolve(__dirname, '../server/src'),
      '@rpgjs/physic': path.resolve(__dirname, '../physic/src'),
      '@rpgjs/vite': path.resolve(__dirname, '../vite/src'),
      '@rpgjs/vue': path.resolve(__dirname, '../vue/src')
    }
  },
  test: {
      environment: 'jsdom',
      setupFiles: ['@rpgjs/testing/dist/setup.js'],
      globals: true
  }
})