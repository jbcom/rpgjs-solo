/// <reference path="./types/canvas-engine.d.ts" />

import { provideLoadMap } from "@rpgjs/client";
import { TiledParser } from "@canvasengine/tiled";
import client from "./client";
import Tiled from "./tiled.ce";
import { prepareTiledPhysicsData } from "./physics";
import type { TiledMapOptions } from "./index";

export function createTiledMapClientProviders(
  options: TiledMapOptions,
) {
  return {
    client,
    providers: [
      provideLoadMap(async (map) => {
        const response = await fetch(`${options.basePath}/${map}.tmx`);
        const mapData = await response.text();
        const parser = new TiledParser(mapData);
        const parsedMap = parser.parseMap();
        const tilesets: any[] = [];

        for (const tileset of parsedMap.tilesets) {
          const tilesetResponse = await fetch(
            `${options.basePath}/${tileset.source}`,
          );
          const tilesetData = await tilesetResponse.text();
          const tilesetParser = new TiledParser(tilesetData);
          const parsedTileset = tilesetParser.parseTileset();
          parsedTileset.image.source = `${options.basePath}/${parsedTileset.image.source}`;
          tilesets.push({ ...tileset, ...parsedTileset });
        }

        parsedMap.tilesets = tilesets;
        const mapObject: any = {
          data: mapData,
          component: Tiled,
          parsedMap,
          id: map,
          params: { basePath: options.basePath },
        };

        prepareTiledPhysicsData(mapObject, mapObject);
        await options.onLoadMap?.(map);
        return mapObject;
      }),
    ],
  };
}
