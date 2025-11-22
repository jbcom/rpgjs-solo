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
 * allowing TMX map parsing and automatic tile-based collision detection
 * using the physics engine's tile grid system
 *
 * ## Features
 *
 * - **Automatic parsing**: Parses TMX files from Tiled Map Editor
 * - **Collision detection**: Scans all tiles to detect collisions
 * - **Tile grid system**: Uses physics engine tile grid to block movement on collision tiles
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
     * @description Parses Tiled data and sets up tile-based collision detection
     * using the physics engine's tile grid system instead of individual hitboxes.
     *
     * This method:
     * 1. Parses TMX data with TiledParser
     * 2. Creates a MapClass instance with parsed data
     * 3. Attaches the Tiled instance to the RpgMap
     * 4. Scans all tiles to detect collisions
     * 5. Stores blocked tiles in a Set for use with the physics engine tile grid
     * 6. Configures tile dimensions for proper coordinate conversion
     *
     * The blocked tiles are used by the physics engine's `canEnterTile` hook
     * to prevent entities from entering collision tiles, which is more efficient
     * than creating individual hitboxes for each tile.
     *
     * @param mapData - Map data containing TMX information
     * @param map - RpgMap instance to extend
     * @returns The modified map instance with tiled property
     *
     * @example
     * ```ts
     * // Blocked tiles are stored as a Set with keys "x,y" (tile coordinates)
     * // The physics engine will automatically check these tiles when entities
     * // try to move, using the canEnterTile hook applied to all entities
     * ```
     */
    onBeforeUpdate<T = RpgMap>(mapData: any, map: T): T {
      const tiledMap = new MapClass(mapData.parsedMap);

      // Attach Tiled instance to the map
      (map as any).tiled = tiledMap;

      // Initialize hitboxes array (for backward compatibility, but we won't populate it)
      mapData.hitboxes = mapData.hitboxes || [];
      mapData.width = tiledMap.widthPx;
      mapData.height = tiledMap.heightPx;

      // Store tile dimensions for coordinate conversion
      const tileWidth = tiledMap.tilewidth;
      const tileHeight = tiledMap.tileheight;
      (map as any)._tiledTileWidth = tileWidth;
      (map as any)._tiledTileHeight = tileHeight;

      // Store blocked tiles in a Set for efficient lookup
      // Key format: "x,y" where x and y are tile coordinates in Tiled's coordinate system
      const blockedTiles = new Set<string>();

      // Iterate through all map tiles to detect collisions
      const mapWidth = tiledMap.width;
      const mapHeight = tiledMap.height;

      // Iterate through each tile on the map
      for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
          // Use getTileByPosition which is simpler and handles pixel coordinates directly
          const pixelX = x * tileWidth;
          const pixelY = y * tileHeight;
          const tileInfo = tiledMap.getTileByPosition(pixelX, pixelY, [0, 0], {
            populateTiles: true,
          });

          // If tile has collision, add it to the blocked tiles set
          if (tileInfo.hasCollision) {
            blockedTiles.add(`${x},${y}`);
          }
        }
      }

      // Store blocked tiles on the map instance
      (map as any)._blockedTiles = blockedTiles;

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

      // Apply tile collision to all existing entities after a short delay
      // to ensure physics entities are created
      setTimeout(() => {
        applyTileCollisionToEntities(map as any);
      }, 0);

      return map;
    },
  },
  player: {
    /**
     * Hook called when a player joins a map
     *
     * @description Applies tile-based collision detection to the player's physics entity
     * using the blocked tiles stored on the map
     *
     * @param player - The player instance
     * @param map - The map instance
     */
    onJoinMap(player: any, map: any) {
      // Apply tile collision after a short delay to ensure physics entity is created
      setTimeout(() => {
        applyTileCollisionToEntity(player, map);
      }, 0);
    },
  },
});

/**
 * Applies tile-based collision detection to a single entity
 *
 * @description This function sets up the `canEnterTile` hook on an entity's physics body
 * to prevent movement into blocked tiles. It converts tile coordinates from the physics
 * engine's coordinate system (based on default 32x32 tiles) to Tiled's coordinate system.
 *
 * @param owner - The owner object (player or event) that has a physics entity
 * @param map - The map instance containing blocked tiles
 *
 * @example
 * ```ts
 * // This is called automatically when a player joins a map or an event is created
 * // The function checks if the tile the entity is trying to enter is in the
 * // blocked tiles set, converting coordinates as needed
 * ```
 */
function applyTileCollisionToEntity(owner: any, map: any) {
  if (!owner?.id || !map?._blockedTiles) {
    return;
  }

  const entity = map.physic?.getEntityByUUID(owner.id);
  if (!entity) {
    return;
  }

  const blockedTiles = map._blockedTiles as Set<string>;
  const tiledTileWidth = map._tiledTileWidth ?? 32;
  const tiledTileHeight = map._tiledTileHeight ?? 32;

  // Physics engine uses default 32x32 tiles, but Tiled may have different dimensions
  // We need to convert physics engine tile coordinates to Tiled tile coordinates
  const physicsTileWidth = 32; // Default physics engine tile width
  const physicsTileHeight = 32; // Default physics engine tile height

  // Apply canEnterTile hook to the entity
  entity.canEnterTile(({ x, y }) => {
    // x, y are tile coordinates from the physics engine (based on 32x32 tiles)
    // Convert to Tiled tile coordinates
    const tiledX = Math.floor((x * physicsTileWidth) / tiledTileWidth);
    const tiledY = Math.floor((y * physicsTileHeight) / tiledTileHeight);

    // Check if this tile is blocked
    const tileKey = `${tiledX},${tiledY}`;
    if (blockedTiles.has(tileKey)) {
      return false; // Block movement into this tile
    }

    return true; // Allow movement
  });
}

/**
 * Applies tile-based collision detection to all existing entities on a map
 *
 * @description This function iterates through all players and events on the map
 * and applies the tile collision hook to each one's physics entity. This is useful
 * when setting up the map for the first time or when entities already exist before
 * the map is loaded.
 *
 * @param map - The map instance containing blocked tiles
 *
 * @example
 * ```ts
 * // Called automatically in onBeforeUpdate to apply collision to existing entities
 * ```
 */
function applyTileCollisionToEntities(map: any) {
  if (!map?._blockedTiles) {
    return;
  }

  // Apply to all players
  if (map.players && typeof map.players === 'function') {
    const players = map.players();
    if (players && typeof players === 'object') {
      for (const playerId in players) {
        const player = players[playerId];
        if (player) {
          applyTileCollisionToEntity(player, map);
        }
      }
    }
  }

  // Apply to all events
  if (map.events && typeof map.events === 'function') {
    const events = map.events();
    if (events && typeof events === 'object') {
      for (const eventId in events) {
        const event = events[eventId];
        if (event) {
          applyTileCollisionToEntity(event, map);
        }
      }
    }
  }
}
