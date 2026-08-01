import { defineConfig } from 'vite';
import { rpgjs, tiledMapFolderPlugin } from '@rpgjs/vite';
import startServer from './src/server';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
   optimizeDeps: {
    include: ['pixi.js > @xmldom/xmldom']
  },
  plugins: [
    vue(),
    tiledMapFolderPlugin({
      sourceFolder: './src/tiled',      // Folder containing your TMX files
      publicPath: '/map',               // Public URL path for maps
      buildOutputPath: 'map'            // Optional; must match publicPath on static hosts
    }),
    ...rpgjs({
      server: startServer,
      entryPoints: {
        mmorpg: {
          client: './src/client.ts',
          server: './src/server.ts',
          adapters: {
            express: './src/entries/express.ts',
          },
        },
      },
    })
  ], 
});
