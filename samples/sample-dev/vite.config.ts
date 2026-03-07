import { defineConfig } from 'vite';
import { rpgjs, tiledMapFolderPlugin } from '@rpgjs/vite';
import startServer from './src/server';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [
    vue(),
    tiledMapFolderPlugin({
      sourceFolder: './src/tiled',      // Folder containing your TMX files
      publicPath: '/map',               // Public URL path for maps
      buildOutputPath: 'assets/data'    // Build output directory
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
