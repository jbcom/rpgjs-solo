/**
 * Shared constants for the RPGJS Studio application
 * 
 * This file contains constants that are used across both client and server
 * to ensure consistency and avoid duplication.
 */

/**
 * Map editor constants
 */
export const MAP_EDITOR_CONSTANTS = {
  /**
   * Maximum number of elements allowed on a map
   * This limit is enforced both on client and server
   */
  MAX_ELEMENTS_COUNT: 300,

  /**
   * Maximum number of pages allowed per event
   * This limit is enforced both on client and server
   */
  MAX_EVENT_PAGES: 50,
  
  /**
   * Default grid size in pixels
   */
  DEFAULT_GRID_SIZE: 32,
  
  /**
   * Default tiles per row in tileset
   */
  DEFAULT_TILES_PER_ROW: 75,
  
  /**
   * Default tile pixel size
   */
  DEFAULT_TILE_PIXEL_SIZE: 48,
  
  /**
   * Terrain tile size in pixels (fixed size, not affected by grid size changes)
   * All terrain tiles are always 48x48 pixels regardless of grid display size
   */
  TERRAIN_TILE_SIZE: 48
} as const;

/**
 * Map dimensions constants
 */
export const MAP_DIMENSIONS = {
  /**
   * Minimum map width in tiles
   */
  MIN_WIDTH: 20,
  
  /**
   * Maximum map width in tiles
   */
  MAX_WIDTH: 50,
  
  /**
   * Minimum map height in tiles
   */
  MIN_HEIGHT: 15,
  
  /**
   * Maximum map height in tiles
   */
  MAX_HEIGHT: 50
} as const;

/**
 * Map size validation helper
 */
export const MAP_SIZE_VALIDATION = {
  /**
   * Validates if map dimensions are within allowed limits
   * @param width Map width in tiles
   * @param height Map height in tiles
   * @returns true if dimensions are valid, false otherwise
   */
  isValidSize: (width: number, height: number): boolean => {
    return width >= MAP_DIMENSIONS.MIN_WIDTH && 
           width <= MAP_DIMENSIONS.MAX_WIDTH &&
           height >= MAP_DIMENSIONS.MIN_HEIGHT && 
           height <= MAP_DIMENSIONS.MAX_HEIGHT;
  },
  
  /**
   * Gets validation error message for invalid map dimensions
   * @param width Map width in tiles
   * @param height Map height in tiles
   * @returns Error message or null if dimensions are valid
   */
  getErrorMessage: (width: number, height: number): string | null => {
    if (width < MAP_DIMENSIONS.MIN_WIDTH || width > MAP_DIMENSIONS.MAX_WIDTH) {
      return `Map width must be between ${MAP_DIMENSIONS.MIN_WIDTH} and ${MAP_DIMENSIONS.MAX_WIDTH} tiles.`;
    }
    if (height < MAP_DIMENSIONS.MIN_HEIGHT || height > MAP_DIMENSIONS.MAX_HEIGHT) {
      return `Map height must be between ${MAP_DIMENSIONS.MIN_HEIGHT} and ${MAP_DIMENSIONS.MAX_HEIGHT} tiles.`;
    }
    return null;
  }
} as const;
