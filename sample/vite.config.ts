import { defineConfig } from 'vite';
import { tiledMapFolderPlugin } from '@rpgjs/vite';
import canvasengine from '@canvasengine/compiler'

export default defineConfig({
  resolve: {
    alias: {
      path: 'path-browserify',
    }
  },
  plugins: [
    tiledMapFolderPlugin({
      sourceFolder: './src/tiled',
      publicPath: '/map',
      buildOutputPath: 'assets/data'
    }),
    canvasengine()
  ], 
});
