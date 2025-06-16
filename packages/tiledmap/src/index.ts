import server from "./server";
import client from "./client";
import { createModule } from "@rpgjs/common";
import { provideLoadMap } from "@rpgjs/client";
import { TiledParser } from "@rpgjs/tiled";
import Tiled from "./tiled.ce";

export function provideTiledMap(options: {
  basePath: string;
  onLoadMap?: (map: string) => Promise<void>;
}) {
  return createModule("TiledMap", [
    {
      server,
      client,
    },
    provideLoadMap?.(async (map) => {
      "use client";
      const response = await fetch(`${options.basePath}/${map}.tmx`);
      const mapData = (await response.text()).replace(
        /source="([^"]+)"/g,
        `source="${options.basePath}/$1"`
      );
      const parser = new TiledParser(mapData);
      const parsedMap = parser.parseMap();
      const tilesets: any = [];
      for (let tileset of parsedMap.tilesets) {
        const response = await fetch(`${tileset.source}`);
        const tilesetData = await response.text();
        const parser = new TiledParser(tilesetData);
        const parsedTileset = parser.parseTileset();
        parsedTileset.image.source = `${options.basePath}/${parsedTileset.image.source}`;
        // Preserve firstgid from the original tileset reference
        tilesets.push({
          ...tileset, // Preserve original properties including firstgid
          ...parsedTileset, // Merge with parsed tileset data
        });
      }
      parsedMap.tilesets = tilesets;

      const events = [
        {
          "event": eval("function Event(options = {}) {\n    return {\n        async onInit() {\n          this.setGraphic('male')\n          //new BattleAi(this)\n        },\n        \n        async onAction(player) {\n           await player.showText('Comment vas tu ?')\n        },\n\n        async onChanges(player) {\n        },\n\n        async onPlayerTouch(player) {\n        }\n    }\n}"),
          "x": 200,
          "y": 200
        }
      ]

      const obj = {
        data: mapData,
        component: Tiled,
        parsedMap,
        events,
        id: map,
      };

      if (options.onLoadMap) {
        await options.onLoadMap(map);
      }

      return obj;
    }),
  ]);
}
