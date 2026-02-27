import canvasengine from "@canvasengine/compiler";
import { directivePlugin, removeImportsPlugin } from "@rpgjs/vite";
import { resolve } from "node:path";
import { build, defineConfig } from "vite";
import dts from "vite-plugin-dts";

const runtimeDir = resolve(process.cwd(), "runtime");
const tsconfigPath = resolve(process.cwd(), "tsconfig.json");

const external = [
  /@rpgjs/,
  /@signestack/,
  "canvasengine",
  "pixi.js",
  "esbuild",
  "@canvasengine/presets",
  "rxjs",
];

const resolveOptions = {
  alias: {
    "@common": runtimeDir,
  },
};

type BuildTarget = "client" | "server" | "runtime";

function createBuildConfig(target: BuildTarget, watch: boolean) {
  if (target === "runtime") {
    return {
      configFile: false as const,
      resolve: resolveOptions,
      plugins: [
        dts({
          include: ["runtime/**/*.ts"],
          outDir: "dist/runtime",
          entryRoot: "runtime",
          tsconfigPath,
        }),
      ],
      build: {
        watch: watch ? {} : undefined,
        outDir: "dist/runtime",
        minify: false,
        lib: {
          entry: {
            index: "runtime/index.ts",
          },
          fileName: "index",
          formats: ["es" as const],
        },
        rollupOptions: {
          external,
          output: {
            preserveModules: true,
            preserveModulesRoot: "runtime",
          },
        },
      },
    };
  }

  const isClient = target === "client";

  return {
    configFile: false as const,
    resolve: resolveOptions,
    plugins: [
      ...(isClient
        ? [
            canvasengine(),
            removeImportsPlugin({ patterns: [/server/] }),
            directivePlugin({ side: "client" as const }),
          ]
        : [
            removeImportsPlugin({ patterns: [/\.ce$/, /client/] }),
            directivePlugin({ side: "server" as const }),
          ]),
      dts({
        include: ["src/**/*.ts"],
        outDir: "dist",
        tsconfigPath,
      }),
    ],
    build: {
      watch: watch ? {} : undefined,
      outDir: `dist/${target}`,
      minify: false,
      lib: {
        entry: {
          index: "src/index.ts",
        },
        fileName: "index",
        formats: ["es" as const],
      },
      rollupOptions: {
        external,
        output: {
          preserveModules: true,
          preserveModulesRoot: "src",
        },
      },
    },
  };
}

async function buildStudioPackage(watch = false) {
  const targets: BuildTarget[] = ["client", "server", "runtime"];
  const builds = targets.map((target) => build(createBuildConfig(target, watch)));
  await Promise.all(builds);
  console.log("✅ Build complete");
}

const isWatchMode = process.argv.includes("--watch");
const isBuildCommand = process.argv.includes("build");
const isManualControl = isWatchMode && isBuildCommand;

export default defineConfig(async ({ command }) => {
  if (isManualControl) {
    buildStudioPackage(true);
    return {};
  }

  if (command === "build") {
    await buildStudioPackage();
    process.exit(0);
  }

  return {
    plugins: [],
  };
});
