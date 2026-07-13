import { RpgMap, RpgServer } from "@rpgjs/server";
import { MapClass } from "@canvasengine/tiled";
import { defineModule } from "@rpgjs/common";
import { applyTiledPointEvents, prepareTiledPhysicsData } from "./physics";

declare module "@rpgjs/server" {
  interface RpgMap {
    /**
     * CanvasEngine Tiled map instance attached by `@rpgjs/tiledmap`.
     */
    tiled?: MapClass;
    /**
     * Tiled layers from the parsed map.
     */
    layers?: any[];
    /**
     * Height used by tile depth calculations. Defaults to the Tiled tile height.
     */
    zTileHeight?: number;
    /**
     * v4 compatibility helper. Returns a Tiled layer by its name.
     */
    getLayerByName?(name: string): any;
    /**
     * v4 compatibility helper. Returns the one-dimensional tile index for tile coordinates.
     */
    getTileIndex?(x: number, y: number): number;
    /**
     * v4 compatibility helper. Returns the pixel origin of a tile coordinate.
     */
    getTileOriginPosition?(x: number, y: number): { x: number; y: number };
    /**
     * v4 compatibility helper. Returns Tiled tile information from pixel coordinates.
     */
    getTileByPosition?(x: number, y: number, z?: number): any;
    /**
     * v4 compatibility helper. Returns Tiled tile information from a one-dimensional index.
     */
    getTileByIndex?(tileIndex: number): any;
    /**
     * v4 compatibility helper. Updates a tile in a Tiled tile layer.
     */
    setTile?(x: number, y: number, layer: string | number, tileInfo: any): any;
    /**
     * v4 compatibility helper. Updates the parsed Tiled tileset list.
     */
    updateTileset?(tileset: any): any;
  }
}

export interface RpgTiledMap extends RpgMap {
  tiled: MapClass;
}

export default defineModule<RpgServer>({
  map: {
    onBeforeUpdate(mapData: unknown, map: RpgMap): void {
      prepareTiledPhysicsData(mapData, map);
      applyTiledPointEvents(mapData);
    },
    onPhysicsInit(map: any, context: { mapData: any }) {
      prepareTiledPhysicsData(context?.mapData, map);
    },
  },
});
