import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { build as viteBuild, type Plugin, type ResolvedConfig } from "vite";

interface MmorpgBuildPluginOptions {
  rpgType: string;
  serverEntry: string;
  adapterEntries?: Record<string, string>;
}

function isBareImport(id: string): boolean {
  return !id.startsWith(".") && !id.startsWith("/") && !id.startsWith("\0");
}

function resolveEntry(root: string, entry: string): string {
  return resolve(root, entry);
}

function collectServerEntries(
  root: string,
  serverEntry: string,
  adapterEntries: Record<string, string>,
): Record<string, string> {
  const entries: Record<string, string> = {};
  const resolvedServerEntry = resolveEntry(root, serverEntry);

  if (!existsSync(resolvedServerEntry)) {
    throw new Error(`[rpgjs:mmorpg-build] Missing server entry: ${serverEntry}`);
  }

  entries.server = resolvedServerEntry;

  for (const [name, entry] of Object.entries(adapterEntries)) {
    const resolvedAdapterEntry = resolveEntry(root, entry);
    if (!existsSync(resolvedAdapterEntry)) {
      throw new Error(`[rpgjs:mmorpg-build] Missing adapter entry "${name}": ${entry}`);
    }
    entries[name] = resolvedAdapterEntry;
  }

  return entries;
}

export function mmorpgBuildPlugin({
  rpgType,
  serverEntry,
  adapterEntries = {},
}: MmorpgBuildPluginOptions): Plugin {
  let config: ResolvedConfig;
  let didBuildServer = false;
  let didCleanDist = false;

  return {
    name: "rpgjs:mmorpg-build",
    apply: "build",
    enforce: "post",
    config(_, env) {
      if (env.command !== "build" || rpgType !== "mmorpg") {
        return;
      }

      return {
        build: {
          outDir: "dist/client",
        },
      };
    },
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    buildStart() {
      if (rpgType !== "mmorpg" || didCleanDist) {
        return;
      }
      didCleanDist = true;
      rmSync(resolve(config.root, "dist"), { recursive: true, force: true });
    },
    async closeBundle() {
      if (rpgType !== "mmorpg" || didBuildServer) {
        return;
      }
      didBuildServer = true;

      const entries = collectServerEntries(config.root, serverEntry, adapterEntries);
      console.log(
        `[rpgjs:mmorpg-build] Building server bundle(s): ${Object.keys(entries).join(", ")}`,
      );

      await viteBuild({
        configFile: false,
        root: config.root,
        define: config.define,
        resolve: {
          alias: config.resolve.alias,
          dedupe: config.resolve.dedupe,
          extensions: config.resolve.extensions,
          mainFields: config.resolve.mainFields,
          conditions: config.resolve.conditions,
        },
        publicDir: false,
        build: {
          emptyOutDir: true,
          minify: false,
          outDir: "dist/server",
          sourcemap: config.build.sourcemap,
          target: "node18",
          lib: {
            entry: entries,
            formats: ["es"],
          },
          rollupOptions: {
            external(id) {
              return isBareImport(id);
            },
            output: {
              entryFileNames: "[name].js",
            },
          },
        },
      });
    },
  };
}
