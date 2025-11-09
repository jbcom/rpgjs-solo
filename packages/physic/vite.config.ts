import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig(({ command, mode }) => {
  // Example mode - serve examples
  if (command === 'serve' && mode === 'example') {
    return {
      root: resolve(__dirname, 'examples/canvas'),
      server: {
        port: 3000,
        open: true,
      },
      resolve: {
        alias: {
          '@': resolve(__dirname, './src'),
        },
      },
      optimizeDeps: {
        include: ['../../src/index.js'],
      },
    };
  }
  
  // RPG example mode
  if (command === 'serve' && mode === 'rpg') {
    return {
      root: resolve(__dirname, 'examples/rpg'),
      server: {
        port: 3001,
        open: true,
      },
      resolve: {
        alias: {
          '@': resolve(__dirname, './src'),
        },
      },
      optimizeDeps: {
        include: ['../../src/index.js'],
      },
    };
  }

  // Library build mode
  return {
    plugins: [
      dts({
        insertTypesEntry: true,
        exclude: ['**/*.test.ts', '**/*.spec.ts'],
      }),
    ],
    build: {
      lib: {
        entry: resolve(__dirname, 'src/index.ts'),
        name: 'RPGPhysic',
        formats: ['es'],
        fileName: 'index',
      },
      rollupOptions: {
        output: {
          preserveModules: true,
          preserveModulesRoot: 'src',
        },
      },
      sourcemap: true,
      minify: false,
      target: 'es2020',
    },
  };
});

