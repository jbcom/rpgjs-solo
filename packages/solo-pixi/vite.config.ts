import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [dts({ include: ['src/**/*.ts'], exclude: ['src/**/*.spec.ts'], outDirs: 'dist' })],
  build: {
    target: 'es2022',
    sourcemap: true,
    minify: false,
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: 'index' },
    rollupOptions: { external: ['@jbcom/rpgjs-solo', 'pixi.js'] }
  }
})
