import { PlayerCtor, ProjectileType } from "@rpgjs/common";
import { RpgCommonPlayer, Direction, Entity } from "@rpgjs/common";
import {
  MovementStrategy,
  MovementOptions,
  LinearMove,
  Dash,
  Knockback,
  PathFollow,
  Oscillate,
  CompositeMovement,
  SeekAvoid,
  LinearRepulsion,
  IceMovement,
  ProjectileMovement,
  random,
  isFunction,
  capitalize,
  PerlinNoise2D
} from "@rpgjs/common";
import type { MovementBody } from "@rpgjs/physic";
import { RpgMap } from "../rooms/map";
import { Observable, Subscription, takeUntil, Subject, tap, switchMap, of, from, take } from 'rxjs';
import { RpgPlayer } from "./Player";


interface PlayerWithMixins extends RpgCommonPlayer {
  getCurrentMap(): RpgMap;
  id: string;
  server: any;
  _destroy$: Subject<void>;
  frequency: number;
  nbPixelInTile: number;
  moveByDirection: (direction: Direction, deltaTimeInt: number) => Promise<boolean>;
  changeDirection: (direction: Direction) => boolean;
}


function wait(sec: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, sec * 1000)
  })
}

type CallbackTileMove = (player: RpgPlayer, map) => Direction[]
type CallbackTurnMove = (player: RpgPlayer, map) => string
type Routes = (string | Promise<any> | Direction | Direction[] | Function)[]

// Re-export MovementOptions from @rpgjs/common for convenience
export type { MovementOptions };

/**
 * Options for moveRoutes method
 */
export interface MoveRoutesOptions {
  /**
   * Callback function called when the player gets stuck (cannot move towards target)
   * 
   * This callback is triggered when the player is trying to move but cannot make progress
   * towards the target position, typically due to obstacles or collisions.
   * 
   * @param player - The player instance that is stuck
   * @param target - The target position the player was trying to reach
   * @param currentPosition - The current position of the player
   * @returns If true, the route will continue; if false, the route will be cancelled
   * 
   * @example
   * ```ts
   * await player.moveRoutes([Move.right()], {
   *   onStuck: (player, target, currentPos) => {
   *     console.log('Player is stuck!');
   *     return false; // Cancel the route
   *   }
   * });
   * ```
   */
  onStuck?: (player: RpgPlayer, target: { x: number; y: number }, currentPosition: { x: number; y: number }) => boolean | void;

  /**
   * Time in milliseconds to wait before considering the player stuck (default: 500ms)
   * 
   * The player must be unable to make progress for this duration before onStuck is called.
   */
  stuckTimeout?: number;

  /**
   * Minimum distance change in pixels to consider movement progress (default: 1 pixel)
   * 
   * If the player moves less than this distance over the stuckTimeout period, they are considered stuck.
   */
  stuckThreshold?: number;
}

export enum Frequency {
  Lowest = 600,
  Lower = 400,
  Low = 200,
  High = 100,
  Higher = 50,
  Highest = 25,
  None = 0
}

export enum Speed {
  Slowest = 0.2,
  Slower = 0.5,
  Slow = 1,
  Normal = 3,
  Fast = 5,
  Faster = 7,
  Fastest = 10
}

/** 
* @title Move
* @enum {Object}
* 
* Move.right(repeat=1) | Movement of a number of pixels on the right
* Move.left(repeat=1) | Movement of a number of pixels on the left 
* Move.up(repeat=1) | Movement of a number of pixels on the up
* Move.down(repeat=1) | Movement of a number of pixels on the down
* Move.random(repeat=1) | Movement of a number of pixels in a random direction
* Move.towardPlayer(player, repeat=1) | Moves a number of pixels in the direction of the designated player
* Move.awayFromPlayer(player, repeat=1) | Moves a number of pixels in the opposite direction of the designated player
* Move.tileRight(repeat=1) | Movement of a number of tiles on the right
* Move.tileLeft(repeat=1) | Movement of a number of tiles on the left
* Move.tileUp(repeat=1) | Movement of a number of tiles on the up
* Move.tileDown(repeat=1) | Movement of a number of tiles on the down
* Move.tileRandom(repeat=1) | Movement of a number of tiles in a random direction
* Move.tileTowardPlayer(player, repeat=1) | Moves a number of tiles in the direction of the designated player
* Move.tileAwayFromPlayer(player, repeat=1) | Moves a number of tiles in the opposite direction of the designated player
* Move.turnRight() | Turn to the right
* Move.turnLeft() | Turn to the left
* Move.turnUp() | Turn to the up
* Move.turnDown() | Turn to the down
* Move.turnRandom() | Turn to random direction
* Move.turnAwayFromPlayer(player) | Turns in the opposite direction of the designated player
* Move.turnTowardPlayer(player) | Turns in the direction of the designated player
* @memberof Move
* */
class MoveList {
  // Shared Perlin noise instance for smooth random movement
  private static perlinNoise: PerlinNoise2D = new PerlinNoise2D();
  private static randomCounter: number = 0;
  // Instance counter for each call to ensure variation
  private static callCounter: number = 0;

  /**
   * Gets a random direction index (0-3) using a hybrid approach for balanced randomness
   * 
   * Uses a combination of hash-based pseudo-randomness and Perlin noise to ensure
   * fair distribution of directions while maintaining smooth, natural-looking movement patterns.
   * The hash function guarantees uniform distribution, while Perlin noise adds spatial/temporal coherence.
   * 
   * @param player - Optional player instance for coordinate-based noise
   * @param index - Optional index for array-based calls to ensure variation
   * @returns Direction index (0-3) corresponding to Right, Left, Up, Down
   */
  private getRandomDirectionIndex(player?: RpgPlayer, index?: number): number {
    // Increment call counter for each invocation to ensure variation
    MoveList.callCounter++;

    // Generate a unique seed from multiple sources
    let seed: number;
    const time = Date.now() * 0.001; // Convert to seconds

    if (player) {
      // Use player coordinates combined with time and call counter
      const playerX = typeof player.x === 'function' ? player.x() : player.x;
      const playerY = typeof player.y === 'function' ? player.y() : player.y;

      // Combine with prime multipliers for better distribution
      seed = Math.floor(
        (playerX * 0.1) +
        (playerY * 0.1) +
        (time * 1000) +
        (MoveList.callCounter * 17) +
        ((index ?? 0) * 31)
      );
    } else {
      // Fallback for non-player contexts
      MoveList.randomCounter++;
      seed = Math.floor(
        (MoveList.randomCounter * 17) +
        (time * 1000) +
        (MoveList.callCounter * 31) +
        ((index ?? 0) * 47)
      );
    }

    // Use multiple hash functions combined to ensure uniform distribution
    // This approach guarantees fair probability across all directions

    // Hash 1: Linear congruential generator
    let hash1 = ((seed * 1103515245 + 12345) & 0x7fffffff) >>> 0;

    // Hash 2: Multiply-shift hash
    let hash2 = ((seed * 2654435761) >>> 0);

    // Hash 3: XOR with rotation
    let hash3 = seed ^ (seed >>> 16);
    hash3 = ((hash3 * 2246822507) >>> 0);

    // Combine hashes using XOR for better distribution
    let combinedHash = (hash1 ^ hash2 ^ hash3) >>> 0;

    // Convert to 0-1 range
    const hashValue = (combinedHash % 1000000) / 1000000;

    // Use Perlin noise for smooth spatial/temporal variation (10% influence only)
    // Very low influence to avoid bias while maintaining some smoothness
    const perlinX = seed * 0.001;
    const perlinY = (seed * 1.618) * 0.001; // Golden ratio
    const perlinValue = MoveList.perlinNoise.getNormalized(perlinX, perlinY, 0.3);

    // Combine hash (90%) with Perlin noise (10%)
    // Very high weight on hash ensures fair distribution, minimal Perlin for subtle smoothness
    const finalValue = (hashValue * 0.9) + (perlinValue * 0.1);

    // Map to direction index (0-3) ensuring uniform distribution
    // Clamp finalValue to [0, 1) range to ensure valid index
    const clampedValue = Math.max(0, Math.min(0.999999, finalValue));
    let directionIndex = Math.floor(clampedValue * 4);

    // Ensure directionIndex is always in valid range [0, 3]
    directionIndex = Math.max(0, Math.min(3, directionIndex));

    // Additional safety check: if somehow we get an invalid value (NaN, Infinity), use hash directly
    if (!Number.isFinite(directionIndex) || directionIndex < 0 || directionIndex > 3) {
      const fallbackIndex = Math.floor(hashValue * 4) % 4;
      return Math.max(0, Math.min(3, fallbackIndex));
    }

    return directionIndex;
  }

  repeatMove(direction: Direction, repeat: number): Direction[] {
    // Safety check for valid repeat value
    if (!Number.isFinite(repeat) || repeat < 0 || repeat > 10000) {
      console.warn('Invalid repeat value:', repeat, 'using default value 1');
      repeat = 1;
    }

    // Ensure repeat is an integer
    repeat = Math.floor(repeat);

    // Additional safety check - ensure repeat is a safe integer
    if (repeat < 0 || repeat > Number.MAX_SAFE_INTEGER || !Number.isSafeInteger(repeat)) {
      console.warn('Unsafe repeat value:', repeat, 'using default value 1');
      repeat = 1;
    }

    try {
      return new Array(repeat).fill(direction);
    } catch (error) {
      console.error('Error creating array with repeat:', repeat, error);
      return [direction]; // Return single direction as fallback
    }
  }

  private repeatTileMove(direction: string, repeat: number, propMap: string): CallbackTileMove {
    return (player: RpgPlayer, map): Direction[] => {
      const playerSpeed = typeof player.speed === 'function' ? player.speed() : player.speed;

      // Safety checks
      if (!playerSpeed || playerSpeed <= 0) {
        console.warn('Invalid player speed:', playerSpeed, 'using default speed 3');
        return this[direction](repeat);
      }

      const repeatTile = Math.floor((map[propMap] || 32) / playerSpeed) * repeat;

      // Additional safety check for the calculated repeat value
      if (!Number.isFinite(repeatTile) || repeatTile < 0 || repeatTile > 10000) {
        console.warn('Calculated repeatTile is invalid:', repeatTile, 'using original repeat:', repeat);
        return this[direction](repeat);
      }

      // Final safety check before calling the method
      if (!Number.isSafeInteger(repeatTile)) {
        console.warn('repeatTile is not a safe integer:', repeatTile, 'using original repeat:', repeat);
        return this[direction](repeat);
      }

      try {
        return this[direction](repeatTile);
      } catch (error) {
        console.error('Error calling direction method with repeatTile:', repeatTile, error);
        return this[direction](repeat); // Fallback to original repeat
      }
    }
  }

  right(repeat: number = 1): Direction[] {
    return this.repeatMove(Direction.Right, repeat)
  }

  left(repeat: number = 1): Direction[] {
    return this.repeatMove(Direction.Left, repeat)
  }

  up(repeat: number = 1): Direction[] {
    return this.repeatMove(Direction.Up, repeat)
  }

  down(repeat: number = 1): Direction[] {
    return this.repeatMove(Direction.Down, repeat)
  }

  wait(sec: number): Promise<unknown> {
    return wait(sec)
  }

  random(repeat: number = 1): Direction[] {
    // Safety check for valid repeat value
    if (!Number.isFinite(repeat) || repeat < 0 || repeat > 10000) {
      console.warn('Invalid repeat value in random:', repeat, 'using default value 1');
      repeat = 1;
    }

    // Ensure repeat is an integer
    repeat = Math.floor(repeat);

    // Additional safety check - ensure repeat is a safe integer
    if (repeat < 0 || repeat > Number.MAX_SAFE_INTEGER || !Number.isSafeInteger(repeat)) {
      console.warn('Unsafe repeat value in random:', repeat, 'using default value 1');
      repeat = 1;
    }

    try {
      // Use Perlin noise for smooth random directions
      // Increment counter before generating directions
      MoveList.randomCounter += repeat;

      return new Array(repeat).fill(null).map((_, index) => {
        // Use getRandomDirectionIndex with index to ensure variation for each element
        const directionIndex = this.getRandomDirectionIndex(undefined, index);
        return [
          Direction.Right,
          Direction.Left,
          Direction.Up,
          Direction.Down
        ][directionIndex];
      });
    } catch (error) {
      console.error('Error creating random array with repeat:', repeat, error);
      return [Direction.Down]; // Return single direction as fallback
    }
  }

  tileRight(repeat: number = 1): CallbackTileMove {
    return this.repeatTileMove('right', repeat, 'tileWidth')
  }

  tileLeft(repeat: number = 1): CallbackTileMove {
    return this.repeatTileMove('left', repeat, 'tileWidth')
  }

  tileUp(repeat: number = 1): CallbackTileMove {
    return this.repeatTileMove('up', repeat, 'tileHeight')
  }

  tileDown(repeat: number = 1): CallbackTileMove {
    return this.repeatTileMove('down', repeat, 'tileHeight')
  }

  tileRandom(repeat: number = 1): CallbackTileMove {
    return (player: RpgPlayer, map): Direction[] => {
      // Safety check for valid repeat value
      if (!Number.isFinite(repeat) || repeat < 0 || repeat > 1000) {
        console.warn('Invalid repeat value in tileRandom:', repeat, 'using default value 1');
        repeat = 1;
      }

      // Ensure repeat is an integer
      repeat = Math.floor(repeat);

      let directions: Direction[] = []
      const directionFunctions: CallbackTileMove[] = [
        this.tileRight(),
        this.tileLeft(),
        this.tileUp(),
        this.tileDown()
      ];
      
      for (let i = 0; i < repeat; i++) {
        // Use Perlin noise with player coordinates and index for smooth random movement
        // Passing index ensures each iteration gets a different direction
        let directionIndex = this.getRandomDirectionIndex(player, i);
        
        // Ensure directionIndex is valid (0-3)
        if (!Number.isInteger(directionIndex) || directionIndex < 0 || directionIndex > 3) {
          console.warn('Invalid directionIndex in tileRandom:', directionIndex, 'using fallback');
          directionIndex = Math.floor(Math.random() * 4) % 4;
        }
        
        const randFn = directionFunctions[directionIndex];

        // Verify that randFn is a function before calling it
        if (typeof randFn !== 'function') {
          console.warn('randFn is not a function in tileRandom, skipping iteration');
          continue;
        }

        try {
          const newDirections = randFn(player, map);
          if (Array.isArray(newDirections)) {
            directions = [...directions, ...newDirections];
          }
        } catch (error) {
          console.warn('Error in tileRandom iteration:', error);
          // Continue with next iteration instead of breaking
        }

        // Safety check to prevent excessive array growth
        if (directions.length > 10000) {
          console.warn('tileRandom generated too many directions, truncating');
          break;
        }
      }
      return directions
    }
  }

  private _awayFromPlayerDirection(player: RpgPlayer, otherPlayer: RpgPlayer): Direction {
    const directionOtherPlayer = otherPlayer.getDirection()
    let newDirection: Direction = Direction.Down

    switch (directionOtherPlayer) {
      case Direction.Left:
      case Direction.Right:
        if (otherPlayer.x() > player.x()) {
          newDirection = Direction.Left
        }
        else {
          newDirection = Direction.Right
        }
        break
      case Direction.Up:
      case Direction.Down:
        if (otherPlayer.y() > player.y()) {
          newDirection = Direction.Up
        }
        else {
          newDirection = Direction.Down
        }
        break
    }
    return newDirection
  }

  private _towardPlayerDirection(player: RpgPlayer, otherPlayer: RpgPlayer): Direction {
    const directionOtherPlayer = otherPlayer.getDirection()
    let newDirection: Direction = Direction.Down

    switch (directionOtherPlayer) {
      case Direction.Left:
      case Direction.Right:
        if (otherPlayer.x() > player.x()) {
          newDirection = Direction.Right
        }
        else {
          newDirection = Direction.Left
        }
        break
      case Direction.Up:
      case Direction.Down:
        if (otherPlayer.y() > player.y()) {
          newDirection = Direction.Down
        }
        else {
          newDirection = Direction.Up
        }
        break
    }
    return newDirection
  }

  private _awayFromPlayer({ isTile, typeMov }: { isTile: boolean, typeMov: string }, otherPlayer: RpgPlayer, repeat: number = 1) {
    const method = (dir: Direction) => {
      const direction: string = DirectionNames[dir as any] || 'down'
      return this[isTile ? 'tile' + capitalize(direction) : direction](repeat)
    }
    return (player: RpgPlayer, map) => {
      let newDirection: Direction = Direction.Down
      switch (typeMov) {
        case 'away':
          newDirection = this._awayFromPlayerDirection(player, otherPlayer)
          break;
        case 'toward':
          newDirection = this._towardPlayerDirection(player, otherPlayer)
          break
      }
      let direction: any = method(newDirection)
      if (isFunction(direction)) {
        direction = direction(player, map)
      }
      return direction
    }
  }

  towardPlayer(player: RpgPlayer, repeat: number = 1) {
    return this._awayFromPlayer({ isTile: false, typeMov: 'toward' }, player, repeat)
  }

  tileTowardPlayer(player: RpgPlayer, repeat: number = 1) {
    return this._awayFromPlayer({ isTile: true, typeMov: 'toward' }, player, repeat)
  }

  awayFromPlayer(player: RpgPlayer, repeat: number = 1): CallbackTileMove {
    return this._awayFromPlayer({ isTile: false, typeMov: 'away' }, player, repeat)
  }

  tileAwayFromPlayer(player: RpgPlayer, repeat: number = 1): CallbackTileMove {
    return this._awayFromPlayer({ isTile: true, typeMov: 'away' }, player, repeat)
  }

  turnLeft(): string {
    return 'turn-' + Direction.Left
  }

  turnRight(): string {
    return 'turn-' + Direction.Right
  }

  turnUp(): string {
    return 'turn-' + Direction.Up
  }

  turnDown(): string {
    return 'turn-' + Direction.Down
  }

  turnRandom(): string {
    // Use Perlin noise for smooth random turn direction with guaranteed variation
    const directionIndex = this.getRandomDirectionIndex();
    return [
      this.turnRight(),
      this.turnLeft(),
      this.turnUp(),
      this.turnDown()
    ][directionIndex]
  }

  turnAwayFromPlayer(otherPlayer: RpgPlayer): CallbackTurnMove {
    return (player: RpgPlayer) => {
      const direction = this._awayFromPlayerDirection(player, otherPlayer)
      return 'turn-' + direction
    }
  }

  turnTowardPlayer(otherPlayer: RpgPlayer): CallbackTurnMove {
    return (player: RpgPlayer) => {
      const direction = this._towardPlayerDirection(player, otherPlayer)
      return 'turn-' + direction
    }
  }
}

// Direction mapping for string conversion
const DirectionNames: { [key: string]: string } = {
  [Direction.Up]: 'up',
  [Direction.Down]: 'down',
  [Direction.Left]: 'left',
  [Direction.Right]: 'right'
};

export const Move = new MoveList();

/**
 * Move Manager mixin
 * 
 * Adds comprehensive movement management capabilities to a player class.
 * Provides access to all available movement strategies and utility methods
 * for common movement patterns.
 * 
 * ## Features
 * - **Strategy Management**: Add, remove, and query movement strategies
 * - **Predefined Movements**: Quick access to common movement patterns
 * - **Composite Movements**: Combine multiple strategies
 * - **Physics Integration**: Seamless integration with the deterministic @rpgjs/physic engine
 * 
 * ## Available Movement Strategies
 * - `LinearMove`: Constant velocity movement
 * - `Dash`: Quick burst movement
 * - `Knockback`: Push effect with decay
 * - `PathFollow`: Follow waypoint sequences
 * - `Oscillate`: Back-and-forth patterns
 * - `SeekAvoid`: AI pathfinding with obstacle avoidance
 * - `LinearRepulsion`: Smoother obstacle avoidance
 * - `IceMovement`: Slippery surface physics
 * - `ProjectileMovement`: Ballistic trajectories
 * - `CompositeMovement`: Combine multiple strategies
 * 
 * @param Base - The base class to extend
 * @returns A new class with comprehensive movement management capabilities
 * 
 * @example
 * ```ts
 * // Basic usage
 * class MyPlayer extends WithMoveManager(RpgCommonPlayer) {
 *   onInput(direction: { x: number, y: number }) {
 *     // Apply dash movement on input
 *     this.dash(direction, 8, 200);
 *   }
 * 
 *   onIceTerrain() {
 *     // Switch to ice physics
 *     this.clearMovements();
 *     this.applyIceMovement({ x: 1, y: 0 }, 4);
 *   }
 * 
 *   createPatrol() {
 *     // Create patrol path
 *     const waypoints = [
 *       { x: 100, y: 100 },
 *       { x: 300, y: 100 },
 *       { x: 300, y: 300 }
 *     ];
 *     this.followPath(waypoints, 2, true);
 *   }
 * }
 * ```
 */
/**
 * Move Manager Mixin
 * 
 * Provides comprehensive movement management capabilities to any class. This mixin handles
 * various types of movement including pathfinding, physics-based movement, route following,
 * and advanced movement strategies like dashing, knockback, and projectile movement.
 * 
 * @param Base - The base class to extend with movement management
 * @returns Extended class with movement management methods
 * 
 * @example
 * ```ts
 * class MyPlayer extends WithMoveManager(BasePlayer) {
 *   constructor() {
 *     super();
 *     this.frequency = Frequency.High;
 *   }
 * }
 * 
 * const player = new MyPlayer();
 * player.moveTo({ x: 100, y: 100 });
 * player.dash({ x: 1, y: 0 }, 8, 200);
 * ```
 */
export function WithMoveManager<TBase extends PlayerCtor>(Base: TBase) {
  const baseProto = Base.prototype as any;
  class WithMoveManagerClass extends Base {
    setAnimation(animationName: string, nbTimes: number): void {
      if (typeof baseProto.setAnimation === 'function') {
        baseProto.setAnimation.call(this, animationName, nbTimes);
      }
    }

    showComponentAnimation(id: string, params: any): void {
      if (typeof baseProto.showComponentAnimation === 'function') {
        baseProto.showComponentAnimation.call(this, id, params);
      }
    }

    // Properties for infinite route management
    _infiniteRoutes: Routes | null = null;
    _finishRoute: ((value: boolean) => void) | null = null;
    _isInfiniteRouteActive: boolean = false;

    set throughOtherPlayer(value: boolean) {
      this._throughOtherPlayer.set(value);
    }

    get throughOtherPlayer(): boolean {
      return this._throughOtherPlayer();
    }

    set through(value: boolean) {
      this._through.set(value);
    }

    get through(): boolean {
      return this._through();
    }

    set frequency(value: number) {
      this._frequency.set(value);
    }

    get frequency(): number {
      return this._frequency();
    }

    set directionFixed(value: boolean) {
      (this as any)._directionFixed.set(value);
    }

    get directionFixed(): boolean {
      return (this as any)._directionFixed();
    }

    set animationFixed(value: boolean) {
      (this as any)._animationFixed.set(value);
    }

    get animationFixed(): boolean {
      return (this as any)._animationFixed();
    }

    /**
     * Add a movement strategy to this entity
     * 
     * Returns a Promise that resolves when the movement completes (when `isFinished()` returns true).
     * If the strategy doesn't implement `isFinished()`, the Promise resolves immediately.
     * 
     * @param strategy - The movement strategy to add
     * @param options - Optional callbacks for start and completion events
     * @returns Promise that resolves when the movement completes
     * 
     * @example
     * ```ts
     * // Fire and forget
     * player.addMovement(new LinearMove({ x: 1, y: 0 }, 200));
     * 
     * // Wait for completion
     * await player.addMovement(new Dash(10, { x: 1, y: 0 }, 200));
     * console.log('Dash completed!');
     * 
     * // With callbacks
     * await player.addMovement(new Knockback({ x: -1, y: 0 }, 5, 300), {
     *   onStart: () => console.log('Knockback started'),
     *   onComplete: () => console.log('Knockback completed')
     * });
     * ```
     */
    addMovement(strategy: MovementStrategy, options?: MovementOptions): Promise<void> {
      const map = (this as unknown as PlayerWithMixins).getCurrentMap() as any;
      if (!map) return Promise.resolve();

      const playerId = (this as unknown as PlayerWithMixins).id;
      return map.moveManager.add(playerId, strategy, options);
    }

    removeMovement(strategy: MovementStrategy): boolean {
      const map = (this as unknown as PlayerWithMixins).getCurrentMap() as any;
      if (!map) return false;

      const playerId = (this as unknown as PlayerWithMixins).id;
      return map.moveManager.remove(playerId, strategy);
    }

    clearMovements(): void {
      const map = (this as unknown as PlayerWithMixins).getCurrentMap() as any;
      if (!map) return;

      const playerId = (this as unknown as PlayerWithMixins).id;
      map.moveManager.clear(playerId);
    }

    hasActiveMovements(): boolean {
      const map = (this as unknown as PlayerWithMixins).getCurrentMap() as any;
      if (!map) return false;

      return map.moveManager.hasActiveStrategies((this as unknown as PlayerWithMixins).id);
    }

    getActiveMovements(): MovementStrategy[] {
      const map = (this as unknown as PlayerWithMixins).getCurrentMap() as any;
      if (!map) return [];

      return map.moveManager.getStrategies((this as unknown as PlayerWithMixins).id);
    }

    /**
     * Move toward a target player or position using AI pathfinding
     * 
     * Uses the `SeekAvoid` strategy to navigate toward the target while avoiding obstacles.
     * The movement speed is based on the player's current `speed` property, scaled appropriately.
     * 
     * @param target - Target player or position `{ x, y }` to move toward
     * 
     * @example
     * ```ts
     * // Move toward another player
     * player.moveTo(otherPlayer);
     * 
     * // Move toward a specific position
     * player.moveTo({ x: 200, y: 150 });
     * ```
     */
    moveTo(target: RpgCommonPlayer | { x: number, y: number }): void {
      const map = (this as unknown as PlayerWithMixins).getCurrentMap() as any;
      if (!map) return;

      const playerId = (this as unknown as PlayerWithMixins).id;
      const engine = map.physic;

      // Calculate maxSpeed based on player's speed
      // Original values: 180 for player target, 80 for position target (with default speed=4)
      // Factor: 45 for player (180/4), 20 for position (80/4)
      const playerSpeed = (this as any).speed();

      // Remove ALL movement strategies that could interfere with SeekAvoid
      // This includes SeekAvoid, Dash, Knockback, and LinearRepulsion
      const existingStrategies = this.getActiveMovements();
      const conflictingStrategies = existingStrategies.filter(s => 
        s instanceof SeekAvoid || 
        s instanceof Dash || 
        s instanceof Knockback || 
        s instanceof LinearRepulsion
      );
      
      if (conflictingStrategies.length > 0) {
        conflictingStrategies.forEach(s => this.removeMovement(s));
      }

      if ('id' in target) {
        const targetProvider = () => {
          const body = (map as any).getBody(target.id) ?? null;
          return body;
        };
        // Factor 45: with speed=4 gives 180 (original value)
        const maxSpeed = playerSpeed * 45;
        map.moveManager.add(
          playerId,
          new SeekAvoid(engine, targetProvider, maxSpeed, 140, 80, 48)
        );
        return;
      }

      const staticTarget = new Entity({
        position: { x: target.x, y: target.y },
        mass: Infinity,
      });
      staticTarget.freeze();

      // Factor 20: with speed=4 gives 80 (original value)
      const maxSpeed = playerSpeed * 20;
      map.moveManager.add(
        playerId,
        new SeekAvoid(engine, () => staticTarget, maxSpeed, 140, 80, 48)
      );
    }

    stopMoveTo(): void {
      const map = (this as unknown as PlayerWithMixins).getCurrentMap() as any;
      if (!map) return;

      const playerId = (this as unknown as PlayerWithMixins).id;
      const strategies = this.getActiveMovements();
      const toRemove = strategies.filter(s => s instanceof SeekAvoid || s instanceof LinearRepulsion);
      
      if (toRemove.length > 0) {
        toRemove.forEach(strategy => {
          this.removeMovement(strategy);
        });
      }
    }

    /**
     * Perform a dash movement in the specified direction
     * 
     * Creates a burst of velocity for a fixed duration. The total speed is calculated
     * by adding the player's base speed (`this.speed()`) to the additional dash speed.
     * This ensures faster players also dash faster proportionally.
     * 
     * With default speed=4 and additionalSpeed=4: total = 8 (same as original default)
     * 
     * @param direction - Normalized direction vector `{ x, y }` for the dash
     * @param additionalSpeed - Extra speed added on top of base speed (default: 4)
     * @param duration - Duration in milliseconds (default: 200)
     * @param options - Optional callbacks for movement events
     * @returns Promise that resolves when the dash completes
     * 
     * @example
     * ```ts
     * // Dash to the right and wait for completion
     * await player.dash({ x: 1, y: 0 });
     * 
     * // Powerful dash with callbacks
     * await player.dash({ x: 0, y: -1 }, 12, 300, {
     *   onStart: () => console.log('Dash started!'),
     *   onComplete: () => console.log('Dash finished!')
     * });
     * ```
     */
    dash(direction: { x: number, y: number }, additionalSpeed: number = 4, duration: number = 200, options?: MovementOptions): Promise<void> {
      const playerSpeed = (this as any).speed();
      // Total dash speed = base speed + additional speed
      // With speed=4, additionalSpeed=4: gives 8 (original default value)
      const totalSpeed = playerSpeed + additionalSpeed;
      // Physic strategies expect seconds (dt is in seconds), while the server API exposes milliseconds
      const durationSeconds = duration / 1000;
      return this.addMovement(new Dash(totalSpeed, direction, durationSeconds), options);
    }

    /**
     * Apply knockback effect in the specified direction
     * 
     * Pushes the entity with an initial force that decays over time.
     * Returns a Promise that resolves when the knockback completes **or is cancelled**.
     * 
     * ## Design notes
     * - The underlying physics `MovementManager` can cancel strategies via `remove()`, `clear()`,
     *   or `stopMovement()` **without resolving the Promise** returned by `add()`.
     * - For this reason, this method considers the knockback finished when either:
     *   - the `add()` promise resolves (normal completion), or
     *   - the strategy is no longer present in the active movements list (cancellation).
     * - When multiple knockbacks overlap, `directionFixed` and `animationFixed` are restored
     *   only after **all** knockbacks have finished (including cancellations).
     * 
     * @param direction - Normalized direction vector `{ x, y }` for the knockback
     * @param force - Initial knockback force (default: 5)
     * @param duration - Duration in milliseconds (default: 300)
     * @param options - Optional callbacks for movement events
     * @returns Promise that resolves when the knockback completes or is cancelled
     * 
     * @example
     * ```ts
     * // Simple knockback (await is optional)
     * await player.knockback({ x: 1, y: 0 }, 5, 300);
     *
     * // Overlapping knockbacks: flags are restored only after the last one ends
     * player.knockback({ x: -1, y: 0 }, 5, 300);
     * player.knockback({ x: 0, y: 1 }, 3, 200);
     *
     * // Cancellation (e.g. map change) will still restore fixed flags
     * // even if the underlying movement strategy promise is never resolved.
     * ```
     */
    async knockback(direction: { x: number, y: number }, force: number = 5, duration: number = 300, options?: MovementOptions): Promise<void> {
      const durationSeconds = duration / 1000;
      const selfAny = this as any;
      const lockKey = '__rpg_knockback_lock__';

      type KnockbackLockState = {
        prevDirectionFixed: boolean;
        prevAnimationFixed: boolean;
        prevAnimationName?: string;
      };

      const getLock = (): KnockbackLockState | undefined => selfAny[lockKey];
      const setLock = (lock: KnockbackLockState): void => {
        selfAny[lockKey] = lock;
      };
      const clearLock = (): void => {
        delete selfAny[lockKey];
      };

      const hasActiveKnockback = (): boolean =>
        this.getActiveMovements().some(s => s instanceof Knockback);

      const setAnimationName = (name: string): void => {
        if (typeof selfAny.setAnimation === 'function') {
          selfAny.setAnimation(name);
          return;
        }
        const animSignal = selfAny.animationName;
        if (animSignal && typeof animSignal === 'object' && typeof animSignal.set === 'function') {
          animSignal.set(name);
        }
      };

      const getAnimationName = (): string | undefined => {
        const animSignal = selfAny.animationName;
        if (typeof animSignal === 'function') {
          try {
            return animSignal();
          } catch {
            return undefined;
          }
        }
        return undefined;
      };

      const restore = (): void => {
        const lock = getLock();
        if (!lock) return;

        this.directionFixed = lock.prevDirectionFixed;

        const prevAnimFixed = lock.prevAnimationFixed;
        this.animationFixed = false; // temporarily unlock so we can restore animation
        if (!prevAnimFixed && lock.prevAnimationName) {
          setAnimationName(lock.prevAnimationName);
        }
        this.animationFixed = prevAnimFixed;

        clearLock();
      };

      const ensureLockInitialized = (): void => {
        if (getLock()) return;

        setLock({
          prevDirectionFixed: this.directionFixed,
          prevAnimationFixed: this.animationFixed,
          prevAnimationName: getAnimationName(),
        });

        this.directionFixed = true;
        setAnimationName('stand');
        this.animationFixed = true;
      };

      const waitUntilRemovedOrTimeout = (strategy: MovementStrategy): Promise<void> => {
        return new Promise<void>((resolve) => {
          const start = Date.now();
          const maxMs = Math.max(0, duration + 1000);

          const intervalId = setInterval(() => {
            const active = this.getActiveMovements();
            if (!active.includes(strategy) || (Date.now() - start > maxMs)) {
              clearInterval(intervalId);
              resolve();
            }
          }, 16);
        });
      };

      // First knockback creates the lock and freezes direction/animation.
      // Next knockbacks reuse the lock and keep the fixed flags enabled.
      ensureLockInitialized();

      const strategy = new Knockback(direction, force, durationSeconds);
      const addPromise = this.addMovement(strategy, options);

      try {
        await Promise.race([addPromise, waitUntilRemovedOrTimeout(strategy)]);
      } finally {
        // Restore only when ALL knockbacks are done (including cancellations).
        if (!hasActiveKnockback()) {
          restore();
        }
      }
    }

    /**
     * Follow a sequence of waypoints
     * 
     * Makes the entity move through a list of positions at a speed calculated
     * from the player's base speed. The `speedMultiplier` allows adjusting
     * the travel speed relative to the player's normal movement speed.
     * 
     * With default speed=4 and multiplier=0.5: speed = 2 (same as original default)
     * 
     * @param waypoints - Array of `{ x, y }` positions to follow in order
     * @param speedMultiplier - Multiplier applied to base speed (default: 0.5)
     * @param loop - Whether to loop back to start after reaching the end (default: false)
     * 
     * @example
     * ```ts
     * // Follow a patrol path at normal speed
     * const patrol = [
     *   { x: 100, y: 100 },
     *   { x: 200, y: 100 },
     *   { x: 200, y: 200 }
     * ];
     * player.followPath(patrol, 1, true); // Loop at full speed
     * 
     * // Slow walk through waypoints
     * player.followPath(waypoints, 0.25, false);
     * ```
     */
    followPath(waypoints: Array<{ x: number, y: number }>, speedMultiplier: number = 0.5, loop: boolean = false): void {
      const playerSpeed = (this as any).speed();
      // Path follow speed = player base speed * multiplier
      // With speed=4, multiplier=0.5: gives 2 (original default value)
      const speed = playerSpeed * speedMultiplier;
      this.addMovement(new PathFollow(waypoints, speed, loop));
    }

    /**
     * Apply oscillating movement pattern
     * 
     * Creates a back-and-forth movement along the specified axis. The movement
     * oscillates sinusoidally between -amplitude and +amplitude from the starting position.
     * 
     * @param direction - Primary oscillation axis (normalized direction vector)
     * @param amplitude - Maximum distance from center in pixels (default: 50)
     * @param period - Time for a complete cycle in milliseconds (default: 2000)
     * 
     * @example
     * ```ts
     * // Horizontal oscillation
     * player.oscillate({ x: 1, y: 0 }, 100, 3000);
     * 
     * // Diagonal bobbing motion
     * player.oscillate({ x: 1, y: 1 }, 30, 1000);
     * ```
     */
    oscillate(direction: { x: number, y: number }, amplitude: number = 50, period: number = 2000): void {
      this.addMovement(new Oscillate(direction, amplitude, period));
    }

    /**
     * Apply ice movement physics
     * 
     * Simulates slippery surface physics where the entity accelerates gradually
     * and has difficulty stopping. The maximum speed is based on the player's
     * base speed multiplied by a speed factor.
     * 
     * With default speed=4 and factor=1: maxSpeed = 4 (same as original default)
     * 
     * @param direction - Target movement direction `{ x, y }`
     * @param speedFactor - Factor multiplied with base speed for max speed (default: 1.0)
     * 
     * @example
     * ```ts
     * // Normal ice physics
     * player.applyIceMovement({ x: 1, y: 0 });
     * 
     * // Fast ice sliding
     * player.applyIceMovement({ x: 0, y: 1 }, 1.5);
     * ```
     */
    applyIceMovement(direction: { x: number, y: number }, speedFactor: number = 1): void {
      const playerSpeed = (this as any).speed();
      // Max ice speed = player base speed * factor
      // With speed=4, factor=1: gives 4 (original default value)
      const maxSpeed = playerSpeed * speedFactor;
      this.addMovement(new IceMovement(direction, maxSpeed));
    }

    /**
     * Shoot a projectile in the specified direction
     * 
     * Creates a projectile with ballistic trajectory. The speed is calculated
     * from the player's base speed multiplied by a speed factor.
     * 
     * With default speed=4 and factor=50: speed = 200 (same as original default)
     * 
     * @param type - Type of projectile trajectory (`Straight`, `Arc`, or `Bounce`)
     * @param direction - Normalized direction vector `{ x, y }`
     * @param speedFactor - Factor multiplied with base speed (default: 50)
     * 
     * @example
     * ```ts
     * // Straight projectile
     * player.shootProjectile(ProjectileType.Straight, { x: 1, y: 0 });
     * 
     * // Fast arc projectile
     * player.shootProjectile(ProjectileType.Arc, { x: 1, y: -0.5 }, 75);
     * ```
     */
    shootProjectile(type: ProjectileType, direction: { x: number, y: number }, speedFactor: number = 50): void {
      const playerSpeed = (this as any).speed();
      // Projectile speed = player base speed * factor
      // With speed=4, factor=50: gives 200 (original default value)
      const speed = playerSpeed * speedFactor;

      const config = {
        speed,
        direction,
        maxRange: type === ProjectileType.Straight ? 500 : undefined,
        maxHeight: type === ProjectileType.Arc ? 100 : undefined,
        gravity: type !== ProjectileType.Straight ? 400 : undefined,
        maxBounces: type === ProjectileType.Bounce ? 3 : undefined,
        bounciness: type === ProjectileType.Bounce ? 0.6 : undefined
      };

      this.addMovement(new ProjectileMovement(type, config));
    }

    moveRoutes(routes: Routes, options?: MoveRoutesOptions): Promise<boolean> {
      const player = this as unknown as PlayerWithMixins;

      // Break any existing route movement
      this.clearMovements();

      return new Promise(async (resolve) => {
        // Store the resolve function for potential breaking
        this._finishRoute = resolve;

        // Process function routes first
        const processedRoutes = await Promise.all(
          routes.map(async (route: any) => {
            if (typeof route === 'function') {
              const map = player.getCurrentMap() as any;
              if (!map) {
                return undefined;
              }
              return route.apply(route, [player, map]);
            }
            return route;
          })
        );

        // Flatten nested arrays
        // Note: We keep promises in the routes array and handle them in the strategy
        const finalRoutes = this.flattenRoutes(processedRoutes);

        // Create a movement strategy that handles all routes
        class RouteMovementStrategy implements MovementStrategy {
          private routeIndex = 0;
          private currentTarget: { x: number; y: number } | null = null; // Center position for physics
          private currentTargetTopLeft: { x: number; y: number } | null = null; // Top-left position for player.x() comparison
          private currentDirection: { x: number; y: number } = { x: 0, y: 0 };
          private finished = false;
          private waitingForPromise = false;
          private promiseStartTime = 0;
          private promiseDuration = 0;
          private readonly routes: Routes;
          private readonly player: PlayerWithMixins;
          private readonly onComplete: (success: boolean) => void;
          private readonly tileSize: number;
          private readonly tolerance: number;
          private readonly onStuck?: MoveRoutesOptions['onStuck'];
          private readonly stuckTimeout: number;
          private readonly stuckThreshold: number;

          // Frequency wait state
          private waitingForFrequency = false;
          private frequencyWaitStartTime = 0;
          private ratioFrequency = 15;

          // Stuck detection state
          private lastPosition: { x: number; y: number } | null = null;
          private lastPositionTime: number = 0;
          private stuckCheckStartTime: number = 0;
          private lastDistanceToTarget: number | null = null;
          private isCurrentlyStuck: boolean = false;
          private stuckCheckInitialized: boolean = false;

          constructor(
            routes: Routes,
            player: PlayerWithMixins,
            onComplete: (success: boolean) => void,
            options?: MoveRoutesOptions
          ) {
            this.routes = routes;
            this.player = player;
            this.onComplete = onComplete;
            this.tileSize = player.nbPixelInTile || 32;
            this.tolerance = 0.5; // Tolerance in pixels for reaching target (reduced for precision)
            this.onStuck = options?.onStuck;
            this.stuckTimeout = options?.stuckTimeout ?? 500; // Default 500ms
            this.stuckThreshold = options?.stuckThreshold ?? 1; // Default 1 pixel

            // Process initial route
            this.processNextRoute();
          }

          private debugLog(message: string, data?: any): void {
            // Debug logging disabled - enable if needed for troubleshooting
          }

          private processNextRoute(): void {
            // Reset frequency wait state when processing a new route
            this.waitingForFrequency = false;
            this.frequencyWaitStartTime = 0;

            // Check if we've completed all routes
            if (this.routeIndex >= this.routes.length) {
              this.debugLog('COMPLETE all routes finished');
              this.finished = true;
              this.onComplete(true);
              return;
            }

            const currentRoute = this.routes[this.routeIndex];
            this.routeIndex++;

            if (currentRoute === undefined) {
              this.processNextRoute();
              return;
            }

            try {
              // Handle different route types
              if (typeof currentRoute === 'object' && 'then' in currentRoute) {
                // Handle Promise (like Move.wait())
                this.debugLog(`WAIT for promise (route ${this.routeIndex}/${this.routes.length})`);
                this.waitingForPromise = true;
                this.promiseStartTime = Date.now();

                // Try to get duration from promise if possible (for Move.wait())
                // Move.wait() creates a promise that resolves after a delay
                // We'll use a default duration and let the promise resolve naturally
                this.promiseDuration = 1000; // Default 1 second, will be updated when promise resolves

                // Set up promise resolution handler
                (currentRoute as Promise<any>).then(() => {
                  this.debugLog('WAIT promise resolved');
                  this.waitingForPromise = false;
                  this.processNextRoute();
                }).catch(() => {
                  this.debugLog('WAIT promise rejected');
                  this.waitingForPromise = false;
                  this.processNextRoute();
                });
              } else if (typeof currentRoute === 'string' && currentRoute.startsWith('turn-')) {
                // Handle turn commands - just change direction, no movement
                const directionStr = currentRoute.replace('turn-', '');
                let direction: Direction = Direction.Down;

                switch (directionStr) {
                  case 'up':
                  case Direction.Up:
                    direction = Direction.Up;
                    break;
                  case 'down':
                  case Direction.Down:
                    direction = Direction.Down;
                    break;
                  case 'left':
                  case Direction.Left:
                    direction = Direction.Left;
                    break;
                  case 'right':
                  case Direction.Right:
                    direction = Direction.Right;
                    break;
                }

                this.debugLog(`TURN to ${directionStr}`);
                if (this.player.changeDirection) {
                  this.player.changeDirection(direction);
                }
                // Turn is instant, continue immediately
                this.processNextRoute();
              } else if (typeof currentRoute === 'number' || typeof currentRoute === 'string') {
                // Handle Direction enum values (number or string) - calculate target position
                const moveDirection = currentRoute as unknown as Direction;
                const map = this.player.getCurrentMap() as any;
                if (!map) {
                  this.finished = true;
                  this.onComplete(false);
                  return;
                }

                // Get current position (top-left from player, which is what player.x() returns)
                // We calculate target based on top-left position to match player.x() expectations
                const currentTopLeftX = typeof this.player.x === 'function' ? this.player.x() : this.player.x;
                const currentTopLeftY = typeof this.player.y === 'function' ? this.player.y() : this.player.y;

                // Get player speed
                let playerSpeed = this.player.speed()

                // Use player speed as distance, not tile size
                let distance = playerSpeed;

                // Merge consecutive routes of same direction
                const initialDistance = distance;
                const initialRouteIndex = this.routeIndex;
                while (this.routeIndex < this.routes.length) {
                  const nextRoute = this.routes[this.routeIndex];
                  if (nextRoute === currentRoute) {
                    distance += playerSpeed;
                    this.routeIndex++;
                  } else {
                    break;
                  }
                }

                // Calculate target top-left position
                let targetTopLeftX = currentTopLeftX;
                let targetTopLeftY = currentTopLeftY;

                switch (moveDirection) {
                  case Direction.Right:
                  case 'right' as any:
                    targetTopLeftX = currentTopLeftX + distance;
                    break;
                  case Direction.Left:
                  case 'left' as any:
                    targetTopLeftX = currentTopLeftX - distance;
                    break;
                  case Direction.Down:
                  case 'down' as any:
                    targetTopLeftY = currentTopLeftY + distance;
                    break;
                  case Direction.Up:
                  case 'up' as any:
                    targetTopLeftY = currentTopLeftY - distance;
                    break;
                }

                // Convert target top-left to center position for physics engine
                // Get entity to access hitbox dimensions
                const entity = map.physic.getEntityByUUID(this.player.id);
                if (!entity) {
                  this.finished = true;
                  this.onComplete(false);
                  return;
                }

                // Get hitbox dimensions for conversion
                const hitbox = this.player.hitbox();
                const hitboxWidth = hitbox?.w ?? 32;
                const hitboxHeight = hitbox?.h ?? 32;

                // Convert top-left to center: center = topLeft + (size / 2)
                const targetX = targetTopLeftX + hitboxWidth / 2;
                const targetY = targetTopLeftY + hitboxHeight / 2;

                this.currentTarget = { x: targetX, y: targetY }; // Center position for physics engine
                this.currentTargetTopLeft = { x: targetTopLeftX, y: targetTopLeftY }; // Top-left position for player.x() comparison
                this.currentDirection = { x: 0, y: 0 };
                
                this.debugLog(`MOVE direction=${moveDirection} from=(${currentTopLeftX.toFixed(1)}, ${currentTopLeftY.toFixed(1)}) to=(${targetTopLeftX.toFixed(1)}, ${targetTopLeftY.toFixed(1)}) dist=${distance.toFixed(1)}`);
                
                // Reset stuck detection when starting a new movement
                this.lastPosition = null;
                this.isCurrentlyStuck = false;
                this.stuckCheckStartTime = 0;
                this.lastDistanceToTarget = null;
                this.stuckCheckInitialized = false;
                // Reset frequency wait state when starting a new movement
                this.waitingForFrequency = false;
                this.frequencyWaitStartTime = 0;
              } else if (Array.isArray(currentRoute)) {
                // Handle array of directions - insert them into routes
                for (let i = currentRoute.length - 1; i >= 0; i--) {
                  this.routes.splice(this.routeIndex, 0, currentRoute[i]);
                }
                this.processNextRoute();
              } else {
                // Unknown route type, skip
                this.processNextRoute();
              }
            } catch (error) {
              console.warn('Error processing route:', error);
              this.processNextRoute();
            }
          }

          update(body: MovementBody, dt: number): void {
            // Don't process if waiting for promise
            if (this.waitingForPromise) {
              body.setVelocity({ x: 0, y: 0 });
              // Check if promise wait time has elapsed (fallback)
              if (Date.now() - this.promiseStartTime > this.promiseDuration) {
                this.waitingForPromise = false;
                this.processNextRoute();
              }
              return;
            }

            // Don't process if waiting for frequency delay
            if (this.waitingForFrequency) {
              body.setVelocity({ x: 0, y: 0 });
              const playerFrequency = this.player.frequency;
              const frequencyMs = playerFrequency || 0;

              if (frequencyMs > 0 && Date.now() - this.frequencyWaitStartTime >= frequencyMs * this.ratioFrequency) {
                this.waitingForFrequency = false;
                this.processNextRoute();
              }
              return;
            }

            // If no target, try to process next route
            if (!this.currentTarget) {
              if (!this.finished) {
                this.processNextRoute();
              }
              if (!this.currentTarget) {
                body.setVelocity({ x: 0, y: 0 });
                // Reset stuck detection when no target
                this.lastPosition = null;
                this.isCurrentlyStuck = false;
                this.lastDistanceToTarget = null;
                this.stuckCheckInitialized = false;
                this.currentTargetTopLeft = null;
                return;
              }
            }

            const entity = body.getEntity?.();
            if (!entity) {
              this.finished = true;
              this.onComplete(false);
              return;
            }

            const currentPosition = { x: entity.position.x, y: entity.position.y };
            const currentTime = Date.now();

            // Check distance using player's top-left position (what player.x() returns)
            // This ensures we match the test expectations which compare player.x()
            const currentTopLeftX = this.player.x();
            const currentTopLeftY = this.player.y()

            // Calculate direction and distance using top-left position if available
            let dx: number, dy: number, distance: number;
            if (this.currentTargetTopLeft) {
              dx = this.currentTargetTopLeft.x - currentTopLeftX;
              dy = this.currentTargetTopLeft.y - currentTopLeftY;
              distance = Math.hypot(dx, dy);

              // Check if we've reached the target (using top-left position)
              if (distance <= this.tolerance) {
                // Target reached, wait for frequency before processing next route
                this.debugLog(`TARGET reached at (${currentTopLeftX.toFixed(1)}, ${currentTopLeftY.toFixed(1)})`);
                this.currentTarget = null;
                this.currentTargetTopLeft = null;
                this.currentDirection = { x: 0, y: 0 };
                body.setVelocity({ x: 0, y: 0 });
                // Reset stuck detection
                this.lastPosition = null;
                this.isCurrentlyStuck = false;
                this.lastDistanceToTarget = null;
                this.stuckCheckInitialized = false;

                // Wait for frequency before processing next route
                if (!this.finished) {
                  const playerFrequency = this.player.frequency;
                  if (playerFrequency && playerFrequency > 0) {
                    this.waitingForFrequency = true;
                    this.frequencyWaitStartTime = Date.now();
                  } else {
                    // No frequency delay, process immediately
                    this.processNextRoute();
                  }
                }
                return;
              }
            } else {
              // Fallback: use center position distance if top-left target not available
              dx = this.currentTarget.x - currentPosition.x;
              dy = this.currentTarget.y - currentPosition.y;
              distance = Math.hypot(dx, dy);

              // Check if we've reached the target (using center position as fallback)
              if (distance <= this.tolerance) {
                // Target reached, wait for frequency before processing next route
                this.currentTarget = null;
                this.currentTargetTopLeft = null;
                this.currentDirection = { x: 0, y: 0 };
                body.setVelocity({ x: 0, y: 0 });
                // Reset stuck detection
                this.lastPosition = null;
                this.isCurrentlyStuck = false;
                this.lastDistanceToTarget = null;
                this.stuckCheckInitialized = false;

                // Wait for frequency before processing next route
                if (!this.finished) {
                  const playerFrequency = player.frequency;
                  if (playerFrequency && playerFrequency > 0) {
                    this.waitingForFrequency = true;
                    this.frequencyWaitStartTime = Date.now();
                  } else {
                    // No frequency delay, process immediately
                    this.processNextRoute();
                  }
                }
                return;
              }
            }

            // Stuck detection: check if player is making progress
            if (this.onStuck && this.currentTarget) {
              // Initialize tracking on first update
              if (!this.stuckCheckInitialized) {
                this.lastPosition = { ...currentPosition };
                this.lastDistanceToTarget = distance;
                this.stuckCheckInitialized = true;
                // Update tracking and continue (don't return early)
                this.lastPositionTime = currentTime;
              } else if (this.lastPosition && this.lastDistanceToTarget !== null) {
                // We have a target, so we're trying to move (regardless of current velocity,
                // which may be zero due to physics engine collision handling)
                const positionChanged = Math.hypot(
                  currentPosition.x - this.lastPosition.x,
                  currentPosition.y - this.lastPosition.y
                ) > this.stuckThreshold;

                const distanceImproved = distance < (this.lastDistanceToTarget - this.stuckThreshold);

                // Player is stuck if: not moving AND not getting closer to target
                if (!positionChanged && !distanceImproved) {
                  // Player is not making progress
                  if (!this.isCurrentlyStuck) {
                    // Start stuck timer
                    this.stuckCheckStartTime = currentTime;
                    this.isCurrentlyStuck = true;
                  } else {
                    // Check if stuck timeout has elapsed
                    if (currentTime - this.stuckCheckStartTime >= this.stuckTimeout) {
                      // Player is stuck, call onStuck callback
                      this.debugLog(`STUCK detected at (${currentPosition.x.toFixed(1)}, ${currentPosition.y.toFixed(1)}) target=(${this.currentTarget.x.toFixed(1)}, ${this.currentTarget.y.toFixed(1)})`);
                      const shouldContinue = this.onStuck(
                        this.player as any,
                        this.currentTarget,
                        currentPosition
                      );

                      if (shouldContinue === false) {
                        // Cancel the route
                        this.debugLog('STUCK cancelled route');
                        this.finished = true;
                        this.onComplete(false);
                        body.setVelocity({ x: 0, y: 0 });
                        return;
                      }

                      // Reset stuck detection to allow another check
                      this.isCurrentlyStuck = false;
                      this.stuckCheckStartTime = 0;
                      // Reset position tracking to start fresh check
                      this.lastPosition = { ...currentPosition };
                      this.lastDistanceToTarget = distance;
                    }
                  }
                } else {
                  // Player is making progress, reset stuck detection
                  this.isCurrentlyStuck = false;
                  this.stuckCheckStartTime = 0;
                }

                // Update tracking variables
                this.lastPosition = { ...currentPosition };
                this.lastPositionTime = currentTime;
                this.lastDistanceToTarget = distance;
              }
            }

            // Get speed scalar from map (default 50 if not found)
            const map = this.player.getCurrentMap() as any;
            const speedScalar = map?.speedScalar ?? 50;

            // Calculate direction and speed
            // Use the distance calculated above (from top-left if available, center otherwise)
            if (distance > 0) {
              this.currentDirection = { x: dx / distance, y: dy / distance };
            } else {
              // If distance is 0 or negative, we've reached or passed the target
              this.currentTarget = null;
              this.currentTargetTopLeft = null;
              this.currentDirection = { x: 0, y: 0 };
              body.setVelocity({ x: 0, y: 0 });
              if (!this.finished) {
                const playerFrequency = typeof this.player.frequency === 'function' ? this.player.frequency() : this.player.frequency;
                if (playerFrequency && playerFrequency > 0) {
                  this.waitingForFrequency = true;
                  this.frequencyWaitStartTime = Date.now();
                } else {
                  // No frequency delay, process immediately
                  this.processNextRoute();
                }
              }
              return;
            }

            // Convert vector direction to cardinal direction (like moveBody does)
            const absX = Math.abs(this.currentDirection.x);
            const absY = Math.abs(this.currentDirection.y);
            let cardinalDirection: Direction;

            if (absX >= absY) {
              cardinalDirection = this.currentDirection.x >= 0 ? Direction.Right : Direction.Left;
            } else {
              cardinalDirection = this.currentDirection.y >= 0 ? Direction.Down : Direction.Up;
            }

            map.movePlayer(this.player as any, cardinalDirection)
          }

          isFinished(): boolean {
            return this.finished;
          }

          onFinished(): void {
            this.onComplete(true);
          }
        }

        // Create and add the route movement strategy
        const routeStrategy = new RouteMovementStrategy(
          finalRoutes,
          player,
          (success: boolean) => {
            this._finishRoute = null;
            resolve(success);
          },
          options
        );

        this.addMovement(routeStrategy);
      });
    }

    private flattenRoutes(routes: Routes): Routes {
      return routes.reduce((acc: Routes, item) => {
        if (Array.isArray(item)) {
          return acc.concat(this.flattenRoutes(item));
        }
        return acc.concat(item);
      }, []);
    }

    infiniteMoveRoute(routes: Routes): void {
      this._infiniteRoutes = routes;
      this._isInfiniteRouteActive = true;

      const executeInfiniteRoute = (isBreaking: boolean = false) => {
        if (isBreaking || !this._isInfiniteRouteActive) return;

        this.moveRoutes(routes).then((completed) => {
          // Only continue if the route completed successfully and we're still active
          if (completed && this._isInfiniteRouteActive) {
            executeInfiniteRoute();
          }
        }).catch((error) => {
          console.warn('Error in infinite route execution:', error);
          // Try to continue even if there was an error
          if (this._isInfiniteRouteActive) {
            setTimeout(() => executeInfiniteRoute(), 100);
          }
        });
      };

      executeInfiniteRoute();
    }

    breakRoutes(force: boolean = false): void {
      this._isInfiniteRouteActive = false;

      if (force) {
        // Force stop by clearing all movements immediately
        this.clearMovements();
      }

      // If there's an active route promise, resolve it
      if (this._finishRoute) {
        this._finishRoute(force);
        this._finishRoute = null;
      }
    }

    replayRoutes(): void {
      if (this._infiniteRoutes && !this._isInfiniteRouteActive) {
        this.infiniteMoveRoute(this._infiniteRoutes);
      }
    }
  }

  return WithMoveManagerClass as unknown as PlayerCtor;
}

/**
 * Interface for Move Manager functionality
 * 
 * Provides comprehensive movement management capabilities including pathfinding,
 * physics-based movement, route following, and advanced movement strategies.
 * This interface defines the public API of the MoveManager mixin.
 */
export interface IMoveManager {
  /** Whether the player passes through other players */
  throughOtherPlayer: boolean;

  /** Whether the player goes through events or other players */
  through: boolean;

  /** Frequency for movement timing (milliseconds between movements) */
  frequency: number;

  /** Whether direction changes are locked (prevents automatic direction changes) */
  directionFixed: boolean;

  /** Whether animation changes are locked (prevents automatic animation changes) */
  animationFixed: boolean;

  /**
   * Add a custom movement strategy to this entity
   * 
   * Returns a Promise that resolves when the movement completes.
   * 
   * @param strategy - The movement strategy to add
   * @param options - Optional callbacks for movement lifecycle events
   * @returns Promise that resolves when the movement completes
   */
  addMovement(strategy: MovementStrategy, options?: MovementOptions): Promise<void>;

  /**
   * Remove a specific movement strategy from this entity
   * 
   * @param strategy - The strategy instance to remove
   * @returns True if the strategy was found and removed
   */
  removeMovement(strategy: MovementStrategy): boolean;

  /**
   * Remove all active movement strategies from this entity
   */
  clearMovements(): void;

  /**
   * Check if this entity has any active movement strategies
   * 
   * @returns True if entity has active movements
   */
  hasActiveMovements(): boolean;

  /**
   * Get all active movement strategies for this entity
   * 
   * @returns Array of active movement strategies
   */
  getActiveMovements(): MovementStrategy[];

  /**
   * Move toward a target player or position using AI pathfinding
   * 
   * @param target - Target player or position to move toward
   */
  moveTo(target: RpgCommonPlayer | { x: number, y: number }): void;

  /**
   * Stop the current moveTo behavior
   */
  stopMoveTo(): void;

  /**
   * Perform a dash movement in the specified direction
   * 
   * The total speed is calculated by adding the player's base speed to the additional speed.
   * Returns a Promise that resolves when the dash completes.
   * 
   * @param direction - Normalized direction vector
   * @param additionalSpeed - Extra speed added on top of base speed (default: 4)
   * @param duration - Duration in milliseconds (default: 200)
   * @param options - Optional callbacks for movement lifecycle events
   * @returns Promise that resolves when the dash completes
   */
  dash(direction: { x: number, y: number }, additionalSpeed?: number, duration?: number, options?: MovementOptions): Promise<void>;

  /**
   * Apply knockback effect in the specified direction
   * 
   * The force is scaled by the player's base speed for consistent behavior.
   * Returns a Promise that resolves when the knockback completes.
   * 
   * @param direction - Normalized direction vector
   * @param force - Force multiplier applied to base speed (default: 5)
   * @param duration - Duration in milliseconds (default: 300)
   * @param options - Optional callbacks for movement lifecycle events
   * @returns Promise that resolves when the knockback completes
   */
  knockback(direction: { x: number, y: number }, force?: number, duration?: number, options?: MovementOptions): Promise<void>;

  /**
   * Follow a sequence of waypoints
   * 
   * Speed is calculated from the player's base speed multiplied by the speedMultiplier.
   * 
   * @param waypoints - Array of x,y positions to follow
   * @param speedMultiplier - Multiplier applied to base speed (default: 0.5)
   * @param loop - Whether to loop back to start (default: false)
   */
  followPath(waypoints: Array<{ x: number, y: number }>, speedMultiplier?: number, loop?: boolean): void;

  /**
   * Apply oscillating movement pattern
   * 
   * @param direction - Primary oscillation axis (normalized)
   * @param amplitude - Maximum distance from center (default: 50)
   * @param period - Time for complete cycle in ms (default: 2000)
   */
  oscillate(direction: { x: number, y: number }, amplitude?: number, period?: number): void;

  /**
   * Apply ice movement physics
   * 
   * Max speed is calculated from the player's base speed multiplied by the speedFactor.
   * 
   * @param direction - Target movement direction
   * @param speedFactor - Factor multiplied with base speed for max speed (default: 1.0)
   */
  applyIceMovement(direction: { x: number, y: number }, speedFactor?: number): void;

  /**
   * Shoot a projectile in the specified direction
   * 
   * Speed is calculated from the player's base speed multiplied by the speedFactor.
   * 
   * @param type - Type of projectile trajectory
   * @param direction - Normalized direction vector
   * @param speedFactor - Factor multiplied with base speed (default: 50)
   */
  shootProjectile(type: ProjectileType, direction: { x: number, y: number }, speedFactor?: number): void;

  /**
   * Give an itinerary to follow using movement strategies
   * 
   * @param routes - Array of movement instructions to execute
   * @param options - Optional configuration including onStuck callback
   * @returns Promise that resolves when all routes are completed
   */
  moveRoutes(routes: Routes, options?: MoveRoutesOptions): Promise<boolean>;

  /**
   * Give a path that repeats itself in a loop to a character
   * 
   * @param routes - Array of movement instructions to repeat infinitely
   */
  infiniteMoveRoute(routes: Routes): void;

  /**
   * Stop an infinite movement
   * 
   * @param force - Forces the stop of the infinite movement immediately
   */
  breakRoutes(force?: boolean): void;

  /**
   * Replay an infinite movement
   */
  replayRoutes(): void;
}
