/**
 * Map tile definitions and constants
 * 
 * Defines the standard tile size and related constants used throughout the application
 * for map rendering and calculations.
 */

/**
 * Standard tile size in pixels
 * 
 * All maps use this tile size for rendering and calculations.
 * Map dimensions (width/height) are expressed in tiles, and must be
 * multiplied by this value to get pixel dimensions.
 * 
 * @example
 * ```ts
 * const mapWidthPx = map.params.width * TILE_SIZE;
 * const mapHeightPx = map.params.height * TILE_SIZE;
 * ```
 */
export const TILE_SIZE = 48;


// ratio entre ce qu'on récupère sur le serveur, et ce qu'on affiche dans le jeu. Exemple, dans le studio, on récupère les positions en px: 256 pour worldX, mais dans le jeu, on affiche 1440 pour worldX.
export const RATIO_MAP_X = 5.625;
export const RATIO_MAP_Y = 5.615;

/**
 * Minimum map dimensions in tiles
 */
export const MAP_DIMENSIONS = {
  MIN_WIDTH: 10,
  MIN_HEIGHT: 10,
  MAX_WIDTH: 200,
  MAX_HEIGHT: 200,
  DEFAULT_WIDTH: 50,
  DEFAULT_HEIGHT: 50
} as const;

/**
 * Converts tile coordinates to pixel coordinates
 * 
 * @param tiles Number of tiles
 * @returns Pixel value
 * 
 * @example
 * ```ts
 * tilesToPixels(50); // Returns 2400 (50 * 48)
 * ```
 */
export function tilesToPixels(tiles: number): number {
  return tiles * TILE_SIZE;
}

/**
 * Converts pixel coordinates to tile coordinates
 * 
 * @param pixels Number of pixels
 * @returns Tile value (rounded)
 * 
 * @example
 * ```ts
 * pixelsToTiles(2400); // Returns 50 (2400 / 48)
 * ```
 */
export function pixelsToTiles(pixels: number): number {
  return Math.round(pixels / TILE_SIZE);
}

