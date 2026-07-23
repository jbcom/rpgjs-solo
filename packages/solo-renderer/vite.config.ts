import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [
    dts({
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts'],
      outDirs: 'dist',
      afterDiagnostic(diagnostics) {
        if (diagnostics.length > 0) {
          throw new Error(`Declaration generation failed with ${diagnostics.length} TypeScript diagnostic(s)`)
        }
      }
    })
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
    minify: false,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index'
    },
    rollupOptions: {
      external: [
        '@arcade-cabinet/rpgjs-patches',
        '@jbcom/rpgjs-solo',
        '@canvasengine/presets',
        '@canvasengine/tiled',
        'canvasengine',
        'pixi.js'
      ]
    }
  }
})
