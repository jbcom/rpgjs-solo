import { PlayerCtor, ProjectileType } from "@rpgjs/common";
import { RpgCommonPlayer, Direction, Entity } from "@rpgjs/common";
import {
  MovementStrategy,
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
  capitalize
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
      return new Array(repeat).fill(null).map(() => [
        Direction.Right,
        Direction.Left,
        Direction.Up,
        Direction.Down
      ][random(0, 3)]);
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
      for (let i = 0; i < repeat; i++) {
        const randFn: CallbackTileMove = [
          this.tileRight(),
          this.tileLeft(),
          this.tileUp(),
          this.tileDown()
        ][random(0, 3)]

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
    return [
      this.turnRight(),
      this.turnLeft(),
      this.turnUp(),
      this.turnDown()
    ][random(0, 3)]
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

    addMovement(strategy: MovementStrategy): void {
      const map = (this as unknown as PlayerWithMixins).getCurrentMap() as any;
      if (!map) return;

      map.moveManager.add((this as unknown as PlayerWithMixins).id, strategy);
    }

    removeMovement(strategy: MovementStrategy): boolean {
      const map = (this as unknown as PlayerWithMixins).getCurrentMap() as any;
      if (!map) return false;

      return map.moveManager.remove((this as unknown as PlayerWithMixins).id, strategy);
    }

    clearMovements(): void {
      const map = (this as unknown as PlayerWithMixins).getCurrentMap() as any;
      if (!map) return;

      map.moveManager.clear((this as unknown as PlayerWithMixins).id);
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

    moveTo(target: RpgCommonPlayer | { x: number, y: number }): void {
      const map = (this as unknown as PlayerWithMixins).getCurrentMap() as any;
      if (!map) return;

      const engine = map.physic;

      if ('id' in target) {
        const targetProvider = () => (map as any).getBody(target.id) ?? null;
        map.moveManager.add(
          (this as unknown as PlayerWithMixins).id,
          new SeekAvoid(engine, targetProvider, 180, 140, 80, 48)
        );
        return;
      }

      const staticTarget = new Entity({
        position: { x: target.x, y: target.y },
        mass: Infinity,
      });
      staticTarget.freeze();

      map.moveManager.add(
        (this as unknown as PlayerWithMixins).id,
        new SeekAvoid(engine, () => staticTarget, 80, 140, 80, 48)
      );
    }

    stopMoveTo(): void {
      const map = (this as unknown as PlayerWithMixins).getCurrentMap() as any;
      if (!map) return;

      const strategies = this.getActiveMovements();
      strategies.forEach(strategy => {
        if (strategy instanceof SeekAvoid || strategy instanceof LinearRepulsion) {
          this.removeMovement(strategy);
        }
      });
    }

    dash(direction: { x: number, y: number }, speed: number = 8, duration: number = 200): void {
      this.addMovement(new Dash(speed, direction, duration));
    }

    knockback(direction: { x: number, y: number }, force: number = 5, duration: number = 300): void {
      this.addMovement(new Knockback(direction, force, duration));
    }

    followPath(waypoints: Array<{ x: number, y: number }>, speed: number = 2, loop: boolean = false): void {
      this.addMovement(new PathFollow(waypoints, speed, loop));
    }

    oscillate(direction: { x: number, y: number }, amplitude: number = 50, period: number = 2000): void {
      this.addMovement(new Oscillate(direction, amplitude, period));
    }

    applyIceMovement(direction: { x: number, y: number }, maxSpeed: number = 4): void {
      this.addMovement(new IceMovement(direction, maxSpeed));
    }

    shootProjectile(type: ProjectileType, direction: { x: number, y: number }, speed: number = 200): void {
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

          private processNextRoute(): void {
            // Check if we've completed all routes
            if (this.routeIndex >= this.routes.length) {
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
                // For Move.wait(), we need to track the wait time
                // Check if it's a wait promise by checking if it resolves after a delay
                this.waitingForPromise = true;
                this.promiseStartTime = Date.now();

                // Try to get duration from promise if possible (for Move.wait())
                // Move.wait() creates a promise that resolves after a delay
                // We'll use a default duration and let the promise resolve naturally
                this.promiseDuration = 1000; // Default 1 second, will be updated when promise resolves

                // Set up promise resolution handler
                (currentRoute as Promise<any>).then(() => {
                  this.waitingForPromise = false;
                  this.processNextRoute();
                }).catch(() => {
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
                // Reset stuck detection when starting a new movement
                this.lastPosition = null;
                this.isCurrentlyStuck = false;
                this.stuckCheckStartTime = 0;
                this.lastDistanceToTarget = null;
                this.stuckCheckInitialized = false;
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
            const currentTopLeftX =  this.player.x();
            const currentTopLeftY =  this.player.y()
            
            // Calculate direction and distance using top-left position if available
            let dx: number, dy: number, distance: number;
            if (this.currentTargetTopLeft) {
              dx = this.currentTargetTopLeft.x - currentTopLeftX;
              dy = this.currentTargetTopLeft.y - currentTopLeftY;
              distance = Math.hypot(dx, dy);

              // Check if we've reached the target (using top-left position)
              if (distance <= this.tolerance) {
                // Target reached, process next route
                this.currentTarget = null;
                this.currentTargetTopLeft = null;
                this.currentDirection = { x: 0, y: 0 };
                body.setVelocity({ x: 0, y: 0 });
                // Reset stuck detection
                this.lastPosition = null;
                this.isCurrentlyStuck = false;
                this.lastDistanceToTarget = null;
                this.stuckCheckInitialized = false;

                // Process next route
                if (!this.finished) {
                  this.processNextRoute();
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
                // Target reached, process next route
                this.currentTarget = null;
                this.currentTargetTopLeft = null;
                this.currentDirection = { x: 0, y: 0 };
                body.setVelocity({ x: 0, y: 0 });
                // Reset stuck detection
                this.lastPosition = null;
                this.isCurrentlyStuck = false;
                this.lastDistanceToTarget = null;
                this.stuckCheckInitialized = false;

                // Process next route
                if (!this.finished) {
                  this.processNextRoute();
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
                      const shouldContinue = this.onStuck(
                        this.player as any,
                        this.currentTarget,
                        currentPosition
                      );
                      
                      if (shouldContinue === false) {
                        // Cancel the route
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
                this.processNextRoute();
              }
              return;
            }

            // Get player speed
            let playerSpeed = this.player.speed();

            // Apply velocity towards target
            // Compensate for linearDamping: the physics engine multiplies velocity by (1 - linearDamping)
            // So we need to divide by (1 - linearDamping) to get the desired velocity after damping
            const physicsEntity = body.getEntity?.();
            const linearDamping = physicsEntity ? (physicsEntity as any).linearDamping ?? 0.2 : 0.2;
            const dampingCompensation = 1 / (1 - linearDamping);
            
            // Reduce velocity when close to target to avoid overshooting
            // Use a smooth deceleration: velocity scales with distance when close
            const decelerationDistance = playerSpeed * speedScalar * 0.5; // Start decelerating at half a speed unit
            const velocityScale = distance < decelerationDistance ? Math.max(0.1, distance / decelerationDistance) : 1.0;
            
            const calculatedVelocityX = this.currentDirection.x * playerSpeed * speedScalar * dampingCompensation * velocityScale;
            const calculatedVelocityY = this.currentDirection.y * playerSpeed * speedScalar * dampingCompensation * velocityScale;
            
            body.setVelocity({
              x: calculatedVelocityX,
              y: calculatedVelocityY,
            });
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

  /**
   * Add a custom movement strategy to this entity
   * 
   * @param strategy - The movement strategy to add
   */
  addMovement(strategy: MovementStrategy): void;

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
   * @param direction - Normalized direction vector
   * @param speed - Movement speed (default: 8)
   * @param duration - Duration in milliseconds (default: 200)
   */
  dash(direction: { x: number, y: number }, speed?: number, duration?: number): void;

  /**
   * Apply knockback effect in the specified direction
   * 
   * @param direction - Normalized direction vector
   * @param force - Initial knockback force (default: 5)
   * @param duration - Duration in milliseconds (default: 300)
   */
  knockback(direction: { x: number, y: number }, force?: number, duration?: number): void;

  /**
   * Follow a sequence of waypoints
   * 
   * @param waypoints - Array of x,y positions to follow
   * @param speed - Movement speed (default: 2)
   * @param loop - Whether to loop back to start (default: false)
   */
  followPath(waypoints: Array<{ x: number, y: number }>, speed?: number, loop?: boolean): void;

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
   * @param direction - Target movement direction
   * @param maxSpeed - Maximum speed when fully accelerated (default: 4)
   */
  applyIceMovement(direction: { x: number, y: number }, maxSpeed?: number): void;

  /**
   * Shoot a projectile in the specified direction
   * 
   * @param type - Type of projectile trajectory
   * @param direction - Normalized direction vector
   * @param speed - Projectile speed (default: 200)
   */
  shootProjectile(type: ProjectileType, direction: { x: number, y: number }, speed?: number): void;

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
