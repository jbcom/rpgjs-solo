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
      buildOutputPath: 'assets/data'    // Build output directory
    }),
    ...rpgjs({
      server: startServer
    })
  ], 
});
