import server from "./server";
import { createModule } from "@rpgjs/common";
import {
  createTiledMapClientProviders,
} from "./client-provider";

export interface TiledMapOptions {
  basePath: string;
  onLoadMap?: (map: string) => Promise<void>;
}

export function provideTiledMap(
  options: TiledMapOptions = { basePath: "map" },
) {
  const clientFeature = createTiledMapClientProviders?.(options);
  return createModule("TiledMap", [
    {
      server,
      client: clientFeature?.client,
    },
    ...(clientFeature?.providers ?? []),
  ]);
}
