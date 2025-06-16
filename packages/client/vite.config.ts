import { defineConfig } from 'vite'
import canvasengine from '@canvasengine/compiler'
import dts from 'vite-plugin-dts'
import path from 'path'
import { fileURLToPath } from 'url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    canvasengine(),
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
    },
    rollupOptions: {
      external: [/@rpgjs/, 'esbuild', 'canvasengine', '@canvasengine/presets', 'rxjs', 'pixi.js'],
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src'
      }
    },
  },
})