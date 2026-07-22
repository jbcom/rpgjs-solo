import { defineConfig } from 'vite'
import { rpgjsSoloBoundary } from '@jbcom/rpgjs-solo-vite'

export default defineConfig({
  plugins: [rpgjsSoloBoundary({ maxEntryBytes: 1_500_000 })],
  publicDir: 'assets',
  build: { target: 'es2022' }
})
