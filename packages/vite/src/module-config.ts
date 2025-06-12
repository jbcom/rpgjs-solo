import { defineConfig, build } from "vite";
import canvasengine from "@canvasengine/compiler";
import dts from "vite-plugin-dts";
import { directivePlugin, removeImportsPlugin } from "./index";

/**
 * Creates a build configuration for client or server side
 * 
 * This function generates a standardized Vite build configuration that can be used
 * for both client and server builds with different plugins and output directories.
 * 
 * @param {Object} options - Build configuration options
 * @param {string} options.side - The build side ('client' or 'server')
 * @param {boolean} options.watch - Whether to enable watch mode
 * @returns {Object} Vite build configuration object
 * 
 * @example
 * ```typescript
 * const clientConfig = createBuildConfig({ side: 'client', watch: false });
 * const serverConfig = createBuildConfig({ side: 'server', watch: true });
 * ```
 */
function createBuildConfig({ side, watch }: { side: 'client' | 'server', watch: boolean }) {
  const isClient = side === 'client';
  
  const plugins = isClient 
    ? [
        canvasengine(),
        removeImportsPlugin({ patterns: [/server/] }),
        directivePlugin({ side: "client" }),
      ]
    : [
        removeImportsPlugin({ patterns: [/\.ce$/, /client/] }),
        directivePlugin({ side: "server" }),
      ];

  return {
    configFile: false as const, // Prevent using this config file
    plugins: [
      ...plugins,
      dts({ 
        include: ['src/**/*.ts'],
        outDir: 'dist'
      })
    ],
    build: {
      watch: watch ? {} : undefined,
      outDir: `dist/${side}`,
      minify: false,
      lib: {
        entry: {
          index: "src/index.ts",
        },
        fileName: "index",
        formats: ["es" as const],
      },
      rollupOptions: {
        external: [
          /@rpgjs/,
          "canvasengine",
          "esbuild",
          "@canvasengine/presets",
          "rxjs",
        ],
        output: {
          preserveModules: true,
          preserveModulesRoot: "src",
        },
      },
    },
  };
}

/**
 * Builds both client and server configurations in parallel
 * 
 * This function creates and executes build configurations for both client and server
 * sides simultaneously using Promise.all for better performance.
 * 
 * @param {boolean} watch - Whether to enable watch mode for both builds
 * @returns {Promise<void[]>} Promise that resolves when both builds are complete
 * 
 * @example
 * ```typescript
 * // Build once
 * await buildClientAndServer(false);
 * 
 * // Build with watch mode
 * await buildClientAndServer(true);
 * ```
 */
async function buildClientAndServer(watch: boolean = false) {
  const clientBuild = build(createBuildConfig({ side: 'client', watch }));
  const serverBuild = build(createBuildConfig({ side: 'server', watch }));

  await Promise.all([clientBuild, serverBuild]);

  console.log("✅ Build complete");
}

const isWatchMode = process.argv.includes("--watch");
const isBuildCommand = process.argv.includes("build");
const isManualControl = isWatchMode && isBuildCommand;

export const rpgjsModuleViteConfig = () => {
  return defineConfig(async ({ command }) => {
    if (isManualControl) {
      buildClientAndServer(true);
      return {};
    }
    if (command === "build") {
      console.log("👀 Building...");
      await buildClientAndServer();
      // Return empty config to prevent default build
      process.exit(0);
    } else {
      return {
        plugins: [],
      };
    }
  });
};
