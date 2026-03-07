import canvasengine from "@canvasengine/compiler";
import { replaceConfigImport } from "./replace-config-import";
import { serverPlugin } from "./server-plugin";
import { entryPointPlugin } from "./entry-point-plugin";
import { mmorpgBuildPlugin } from "./mmorpg-build-plugin";

type MmorpgEntryPoints =
  | string
  | {
      client?: string;
      server?: string;
      adapters?: Record<string, string>;
    };

interface RpgjsPluginOptions {
  server: any;
  entryPoints?: {
    rpg?: string;
    mmorpg?: MmorpgEntryPoints;
  };
}

function normalizeMmorpgEntryPoints(entryPoints?: MmorpgEntryPoints) {
  if (!entryPoints || typeof entryPoints === "string") {
    return {
      client: entryPoints ?? "./src/client.ts",
      server: "./src/server.ts",
      adapters: {},
    };
  }

  return {
    client: entryPoints.client ?? "./src/client.ts",
    server: entryPoints.server ?? "./src/server.ts",
    adapters: entryPoints.adapters ?? {},
  };
}

export function rpgjs({
  server,
  entryPoints
}: RpgjsPluginOptions) {
  const mmorpgEntryPoints = normalizeMmorpgEntryPoints(entryPoints?.mmorpg);

  return [
    canvasengine(),
    replaceConfigImport(),
    serverPlugin(server),
    mmorpgBuildPlugin({
      rpgType: process.env.RPG_TYPE || "rpg",
      serverEntry: mmorpgEntryPoints.server,
      adapterEntries: mmorpgEntryPoints.adapters,
    }),
    entryPointPlugin({
      entryPoints: {
        rpg: entryPoints?.rpg ?? './src/standalone.ts',
        mmorpg: mmorpgEntryPoints.client,
      }
    })
  ]
}
