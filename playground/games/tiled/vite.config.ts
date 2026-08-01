import { defineConfig } from 'vite';
import { rpgjs, tiledMapFolderPlugin } from '@rpgjs/vite';
import startServer from './src/server';
import playgroundConfig from './playground.config.json';

export default defineConfig({
  server: {
    port: playgroundConfig.port,
    strictPort: true,
  },
  plugins: [
    tiledMapFolderPlugin({
      sourceFolder: './src/tiled',      // Folder containing your TMX files
      publicPath: '/map',               // Public URL path for maps
      buildOutputPath: 'map'            // Optional; must match publicPath on static hosts
    }),
    ...rpgjs({
      server: startServer
    })
  ], 
});
