import { defineConfig } from 'vite';
import { rpgjs } from '@rpgjs/vite';
import startServer from './src/server';
import playgroundConfig from './playground.config.json';


export default defineConfig({
  optimizeDeps: {
    include: ['pixi.js > @xmldom/xmldom']
  },
  server: {
    port: playgroundConfig.port,
    strictPort: true,
     proxy: {
      '/api': {
        target: 'http://localhost:5173',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    ...rpgjs({
      server: startServer
    })
  ], 
});
