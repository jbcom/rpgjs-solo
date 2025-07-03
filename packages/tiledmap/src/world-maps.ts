// Types pour world maps - ne nécessite pas d'import externe

/**
 * Interface pour les informations de world map
 */
export interface RpgTiledWorldMap {
  id: string;
  x: number;           // Position X dans le monde
  y: number;           // Position Y dans le monde  
  width: number;       // Largeur en pixels
  height: number;      // Hauteur en pixels
  worldX: number;      // Coordonnée X mondiale
  worldY: number;      // Coordonnée Y mondiale
  widthPx: number;     // Largeur en pixels (alias)
  heightPx: number;    // Hauteur en pixels (alias)
  tileWidth: number;   // Largeur d'une tile
  tileHeight: number;  // Hauteur d'une tile
}

/**
 * Configuration d'une world map
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
 * Gestionnaire des world maps
 * 
 * Gère la collection de maps interconnectées et leurs relations spatiales
 */
export class WorldMapsManager {
  private maps: Map<string, RpgTiledWorldMap> = new Map();
  private spatialIndex: Map<string, string> = new Map(); // "x,y" -> mapId

  /**
   * Configurer les world maps
   * 
   * @param configs - Array des configurations de maps
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
      const worldMap: RpgTiledWorldMap = {
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
   * Trouver les maps adjacentes à une position donnée
   * 
   * @param map - Map de référence
   * @param coordinates - Coordonnées dans le monde
   * @returns Array des maps adjacentes (normalement 1 seule)
   * 
   * @example
   * ```ts
   * const adjacent = worldMaps.getAdjacentMaps(currentMap, { x: 1024, y: 0 });
   * ```
   */
  getAdjacentMaps(map: RpgTiledWorldMap, coordinates: {x: number, y: number}): RpgTiledWorldMap[] {
    const mapId = this.spatialIndex.get(`${coordinates.x},${coordinates.y}`);
    if (!mapId) return [];

    const adjacentMap = this.maps.get(mapId);
    return adjacentMap ? [adjacentMap] : [];
  }

  /**
   * Obtenir les informations d'une map par son ID
   * 
   * @param mapId - ID de la map
   * @returns Informations de la map ou null si non trouvée
   * 
   * @example
   * ```ts
   * const mapInfo = worldMaps.getMapInfo("forest");
   * ```
   */
  getMapInfo(mapId: string): RpgTiledWorldMap | null {
    return this.maps.get(mapId) ?? null;
  }

  /**
   * Obtenir toutes les maps configurées
   * 
   * @returns Array de toutes les world maps
   */
  getAllMaps(): RpgTiledWorldMap[] {
    return Array.from(this.maps.values());
  }

  /**
   * Trouver une map par coordonnées monde
   * 
   * @param worldX - Coordonnée X mondiale
   * @param worldY - Coordonnée Y mondiale
   * @returns Map trouvée ou null
   */
  getMapByWorldCoordinates(worldX: number, worldY: number): RpgTiledWorldMap | null {
    const mapId = this.spatialIndex.get(`${worldX},${worldY}`);
    return mapId ? this.maps.get(mapId) ?? null : null;
  }

  /**
   * Calculer la position monde absolue d'un joueur
   * 
   * @param map - Map actuelle
   * @param localX - Position X locale dans la map
   * @param localY - Position Y locale dans la map
   * @returns Coordonnées absolues dans le monde
   */
  getWorldPosition(map: RpgTiledWorldMap, localX: number, localY: number): {x: number, y: number} {
    return {
      x: map.worldX + localX,
      y: map.worldY + localY
    };
  }

  /**
   * Calculer la position locale depuis une position monde
   * 
   * @param worldX - Position X mondiale
   * @param worldY - Position Y mondiale
   * @param targetMap - Map cible
   * @returns Position locale dans la map cible
   */
  getLocalPosition(worldX: number, worldY: number, targetMap: RpgTiledWorldMap): {x: number, y: number} {
    return {
      x: worldX - targetMap.worldX,
      y: worldY - targetMap.worldY
    };
  }
}