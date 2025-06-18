import { RpgMap, RpgServer } from "@rpgjs/server";
import { MapClass } from "@canvasengine/tiled";
import { defineModule } from "@rpgjs/common";

// Extend RpgMap interface to include tiled property
declare module "@rpgjs/server" {
  interface RpgMap {
    tiled?: MapClass;
  }
}

/**
 * Interface for an RpgMap extended with Tiled functionality
 *
 * @description This interface combines RpgMap with MapClass to enable
 * the use of Tiled methods on RPG maps
 */
export interface RpgTiledMap extends RpgMap {
  tiled: MapClass;
}

/**
 * Tiled Module for RPGJS
 *
 * @description This module extends RPGJS maps with Tiled functionality,
 * allowing TMX map parsing and automatic hitbox creation
 * based on collisions defined in Tiled
 *
 * ## Features
 *
 * - **Automatic parsing**: Parses TMX files from Tiled Map Editor
 * - **Collision detection**: Scans all tiles to detect collisions
 * - **Hitbox creation**: Automatically generates hitboxes for each collision tile
 * - **RpgMap extension**: Adds the `tiled` property to all RpgMap instances
 *
 * ## Usage
 *
 * Once this module is activated, you can use Tiled methods on your maps:
 *
 * @example
 * ```ts
 * // In a map class
 * class MyMap extends RpgMap {
 *     onLoad() {
 *         // Access Tiled functionality
 *         const tiles = this.tiled.getTileByPosition(100, 100);
 *
 *         if (tiles.hasCollision) {
 *             console.log('This position has a collision');
 *         }
 *
 *         // Iterate through all tiles by index
 *         for (let i = 0; i < this.tiled.width * this.tiled.height; i++) {
 *             const tileInfo = this.tiled.getTileByIndex(i);
 *             if (tileInfo.hasCollision) {
 *                 console.log(`Tile ${i} has collision`);
 *             }
 *         }
 *
 *         // Get information about a specific layer
 *         const layer = this.tiled.getLayerByName('Collision');
 *         if (layer) {
 *             console.log('Collision layer found:', layer);
 *         }
 *     }
 * }
 * ```
 */
export default defineModule<RpgServer>({
  map: {
    /**
     * Hook called before map update
     *
     * @description Parses Tiled data and creates collision hitboxes
     * automatically by iterating through all tiles on the map.
     *
     * This method:
     * 1. Parses TMX data with TiledParser
     * 2. Creates a MapClass instance with parsed data
     * 3. Attaches the Tiled instance to the RpgMap
     * 4. Scans all tiles to detect collisions
     * 5. Automatically creates hitboxes for each collision tile
     *
     * @param mapData - Map data containing TMX information
     * @param map - RpgMap instance to extend
     * @returns The modified map instance with tiled property
     *
     * @example
     * ```ts
     * // Created hitboxes will have this structure:
     * {
     *     id: 'collision_x_y',           // Unique identifier
     *     x: x * tileWidth,              // X position in pixels
     *     y: y * tileHeight,             // Y position in pixels
     *     width: tileWidth,              // Tile width
     *     height: tileHeight,            // Tile height
     *     properties: {
     *         type: 'collision',         // Hitbox type
     *         tileX: x,                  // X position in tiles
     *         tileY: y,                  // Y position in tiles
     *         tileIndex: tileIndex       // Tile index
     *     }
     * }
     * ```
     */
    onBeforeUpdate<T = RpgMap>(mapData: any, map: T): T {
      const tiledMap = new MapClass(mapData.parsedMap);

      // Attach Tiled instance to the map
      (map as any).tiled = tiledMap;

      // Initialize hitboxes array
      mapData.hitboxes = mapData.hitboxes || [];
      mapData.width = tiledMap.widthPx;
      mapData.height = tiledMap.heightPx;

      // Iterate through all map tiles to detect collisions
      const mapWidth = tiledMap.width;
      const mapHeight = tiledMap.height;
      const tileWidth = tiledMap.tilewidth;
      const tileHeight = tiledMap.tileheight;

      // Iterate through each tile on the map
      for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
          // Use getTileByPosition which is simpler and handles pixel coordinates directly
          const pixelX = x * tileWidth;
          const pixelY = y * tileHeight;
          const tileInfo = tiledMap.getTileByPosition(pixelX, pixelY, [0, 0], {
            populateTiles: true,
          });

          // If tile has collision, create a hitbox
          if (tileInfo.hasCollision) {
            const hitbox = {
              id: `collision_${x}_${y}`,
              x: pixelX,
              y: pixelY,
              width: tileWidth,
              height: tileHeight,
              properties: {
                type: "collision",
                tileX: x,
                tileY: y,
                tileIndex: tileInfo.tileIndex,
              },
            };

            mapData.hitboxes.push(hitbox);
          }
        }
      }

      for (let obj of mapData.parsedMap.objects) {
        if (obj.point) {
          mapData.events = mapData.events
            .map((e) => {
              if (e.name === obj.name) {
                return {
                  event: e,
                  x: obj.x,
                  y: obj.y,
                };
              }
              return e;
            })
            .filter((e) => e !== null);
        }
      }
      return map;
    },
  },
});
