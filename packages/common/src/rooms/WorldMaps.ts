/**
 * Interface for world map information
 */
export interface WorldMapInfo {
  id: string;
  x: number;           // World X position 
  y: number;           // World Y position
  width: number;       // Width in pixels
  height: number;      // Height in pixels
  worldX: number;      // World X coordinate (alias for x)
  worldY: number;      // World Y coordinate (alias for y)
  widthPx: number;     // Width in pixels (alias for width)
  heightPx: number;    // Height in pixels (alias for height)
  tileWidth: number;   // Tile width
  tileHeight: number;  // Tile height
}

/**
 * Configuration for a world map
 */
export interface WorldMapConfig {
  id: string;
  worldX: number;
  worldY: number;
  width: number;
  height: number;
  tileWidth?: number;
  tileHeight?: number;
}

/**
 * World Maps Manager
 * 
 * Manages a collection of interconnected maps and their spatial relationships
 */
export class WorldMapsManager {
  private maps: Map<string, WorldMapInfo> = new Map();
  private spatialIndex: Map<string, string> = new Map(); // "x,y" -> mapId

  /**
   * Configure the world maps
   * 
   * @param configs - Array of map configurations
   * 
   * @example
   * ```ts
   * const worldMaps = new WorldMapsManager();
   * worldMaps.configure([
   *   { id: "town", worldX: 0, worldY: 0, width: 1024, height: 768 },
   *   { id: "forest", worldX: 1024, worldY: 0, width: 1024, height: 768 }
   * ]);
   * ```
   */
  configure(configs: WorldMapConfig[]) {
    this.maps.clear();
    this.spatialIndex.clear();

    for (const config of configs) {
      const worldMap: WorldMapInfo = {
        id: config.id,
        x: config.worldX,
        y: config.worldY,
        width: config.width,
        height: config.height,
        worldX: config.worldX,
        worldY: config.worldY,
        widthPx: config.width,
        heightPx: config.height,
        tileWidth: config.tileWidth ?? 32,
        tileHeight: config.tileHeight ?? 32,
      };

      this.maps.set(config.id, worldMap);
      this.spatialIndex.set(`${config.worldX},${config.worldY}`, config.id);
    }
  }

  /**
   * Find adjacent maps at given coordinates
   * 
   * @param map - Reference map
   * @param coordinates - World coordinates
   * @returns Array of adjacent maps (usually 1)
   * 
   * @example
   * ```ts
   * const adjacent = worldMaps.getAdjacentMaps(currentMap, { x: 1024, y: 0 });
   * ```
   */
  getAdjacentMaps(map: WorldMapInfo, coordinates: {x: number, y: number}): WorldMapInfo[] {
    const mapId = this.spatialIndex.get(`${coordinates.x},${coordinates.y}`);
    if (!mapId) return [];

    const adjacentMap = this.maps.get(mapId);
    return adjacentMap ? [adjacentMap] : [];
  }

  /**
   * Get map information by ID
   * 
   * @param mapId - Map ID
   * @returns Map information or null if not found
   * 
   * @example
   * ```ts
   * const mapInfo = worldMaps.getMapInfo("forest");
   * ```
   */
  getMapInfo(mapId: string): WorldMapInfo | null {
    return this.maps.get(mapId) ?? null;
  }

  /**
   * Get all configured maps
   * 
   * @returns Array of all world maps
   */
  getAllMaps(): WorldMapInfo[] {
    return Array.from(this.maps.values());
  }

  /**
   * Find map by world coordinates
   * 
   * @param worldX - World X coordinate
   * @param worldY - World Y coordinate
   * @returns Map found or null
   */
  getMapByWorldCoordinates(worldX: number, worldY: number): WorldMapInfo | null {
    const mapId = this.spatialIndex.get(`${worldX},${worldY}`);
    return mapId ? this.maps.get(mapId) ?? null : null;
  }

  /**
   * Calculate absolute world position of a player
   * 
   * @param map - Current map
   * @param localX - Local X position in the map
   * @param localY - Local Y position in the map
   * @returns Absolute coordinates in the world
   */
  getWorldPosition(map: WorldMapInfo, localX: number, localY: number): {x: number, y: number} {
    return {
      x: map.worldX + localX,
      y: map.worldY + localY
    };
  }

  /**
   * Calculate local position from world position
   * 
   * @param worldX - World X position
   * @param worldY - World Y position
   * @param targetMap - Target map
   * @returns Local position in the target map
   */
  getLocalPosition(worldX: number, worldY: number, targetMap: WorldMapInfo): {x: number, y: number} {
    return {
      x: worldX - targetMap.worldX,
      y: worldY - targetMap.worldY
    };
  }
}