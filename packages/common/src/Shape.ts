import { RpgCommonPlayer } from "./Player";

/**
 * Shape positioning relative to the player
 */
export type ShapePositioning = "center" | "top" | "bottom" | "left" | "right" | "default";

/**
 * Represents a zone shape attached to a player or event
 * 
 * Shapes are used for detection zones, vision cones, and area-of-effect abilities.
 * They are backed by the physic engine's zone system for accurate detection.
 * 
 * @example
 * ```ts
 * // Create a shape attached to a player
 * const visionShape = player.attachShape("vision", {
 *   radius: 150,
 *   angle: 120,
 *   direction: Direction.Right,
 *   name: "Vision Zone",
 *   properties: { type: "detection" }
 * });
 * 
 * // Check if a player is in the shape
 * if (visionShape.playerIsIn(otherPlayer)) {
 *   console.log("Player detected!");
 * }
 * 
 * // Get the owner of the shape
 * const owner = visionShape.getPlayerOwner();
 * ```
 */
export class RpgShape {
  /** Name of the shape */
  public name: string;
  
  /** Positioning relative to the player */
  public positioning: ShapePositioning;
  
  /** Width of the shape in pixels */
  public width: number;
  
  /** Height of the shape in pixels */
  public height: number;
  
  /** X position of the shape center */
  public x: number;
  
  /** Y position of the shape center */
  public y: number;
  
  /** Custom properties attached to the shape */
  public properties: object;
  
  /** Internal: Player that owns this shape */
  private _playerOwner?: RpgCommonPlayer;
  
  /** Internal: Zone ID in the physic engine */
  private _physicZoneId: string;
  
  /** Internal: Map reference for zone queries */
  private _map: any;
  
  /**
   * Creates a new RpgShape instance
   * 
   * @param config - Shape configuration
   */
  constructor(config: {
    name: string;
    positioning: ShapePositioning;
    width: number;
    height: number;
    x: number;
    y: number;
    properties: object;
    playerOwner?: RpgCommonPlayer;
    physicZoneId: string;
    map: any;
  }) {
    this.name = config.name;
    this.positioning = config.positioning;
    this.width = config.width;
    this.height = config.height;
    this.x = config.x;
    this.y = config.y;
    this.properties = config.properties;
    this._playerOwner = config.playerOwner;
    this._physicZoneId = config.physicZoneId;
    this._map = config.map;
  }
  
  /**
   * Checks if a player is currently inside this shape
   * 
   * @param player - The player to check
   * @returns True if the player is inside the shape
   * 
   * @example
   * ```ts
   * const shape = player.attachShape("detection", { radius: 100 });
   * if (shape.playerIsIn(otherPlayer)) {
   *   console.log("Player detected in zone");
   * }
   * ```
   */
  playerIsIn(player: RpgCommonPlayer): boolean {
    if (!this._map) return false;
    
    const zoneManager = this._map.physic.getZoneManager();
    const entities = zoneManager.getEntitiesInZone(this._physicZoneId);
    
    if (!entities || entities.length === 0) return false;
    
    const playerEntity = this._map.physic.getEntityByUUID(player.id);
    if (!playerEntity) return false;
    
    return entities.some(entity => entity.uuid === playerEntity.uuid);
  }
  
  /**
   * Gets the player that owns this shape
   * 
   * Returns the player on which `attachShape()` was called to create this shape.
   * 
   * @returns The player owner or undefined if not available
   * 
   * @example
   * ```ts
   * const shape = player.attachShape("vision", { radius: 150 });
   * const owner = shape.getPlayerOwner();
   * console.log(owner?.name); // Player's name
   * ```
   */
  getPlayerOwner(): RpgCommonPlayer | undefined {
    return this._playerOwner;
  }
  
  /**
   * Updates the shape's position
   * 
   * @internal
   */
  public _updatePosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }
}
