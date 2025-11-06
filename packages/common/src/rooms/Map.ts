import { generateShortUUID, users } from "@signe/sync";
import { effect, Signal, signal } from "@signe/reactive";
import { Direction, RpgCommonPlayer } from "../Player";
import { RpgCommonPhysic } from "../Physic";
import { Observable, share, Subject, Subscription } from "rxjs";
import { Knockback, LinearMove, MovementManager } from "../movement";
import { WorldMapsManager, type RpgWorldMaps } from "./WorldMaps";
import type { ZoneOptions } from "../Physic";

export abstract class RpgCommonMap<T extends RpgCommonPlayer> {
  abstract players: Signal<Record<string, T>>;
  abstract events: Signal<Record<string, any>>;
  
  data = signal<any | null>(null);
  physic = new RpgCommonPhysic();
  moveManager = new MovementManager();
  
  // World Maps properties
  tileWidth?: number;
  tileHeight?: number;
  worldMapsManager?: WorldMapsManager;
  
  // Synchronization throttling properties
  throttleSync?: number;
  throttleStorage?: number;
  sessionExpiryTime?: number;

  tickSubscription?: Subscription | null;
  playersSubscription?: Subscription | null;
  eventsSubscription?: Subscription | null;

  get isStandalone() {
    return typeof window !== 'undefined'
  }

  /**
   * Observable representing the game loop tick
   * 
   * This observable emits the current timestamp every 16ms (approximately 60fps).
   * It's shared using the share() operator, meaning that all subscribers will receive
   * events from a single interval rather than creating multiple intervals.
   * 
   * @example
   * ```ts
   * // Subscribe to the game tick to update entity positions
   * map.tick$.subscribe(timestamp => {
   *   // Update game entities based on elapsed time
   *   this.updateEntities(timestamp);
   * });
   * ```
   */
  tick$ = new Observable<{ delta: number, timestamp: number }>(observer => {
    const interval = setInterval(() => {
      observer.next({
        delta: 16,
        timestamp: Date.now()
      });
    }, 16);
    return () => clearInterval(interval);
  }).pipe(
    share()
  );

  /**
   * Clear all physics content and reset to initial state
   * 
   * This method completely clears the physics system by:
   * - Removing all hitboxes (static and movable)
   * - Removing all zones
   * - Clearing all collision data and events
   * - Clearing all movement events and sliding data
   * - Unsubscribing from the tick subscription
   * - Resetting the physics engine to a clean state
   * 
   * Use this method when you need to completely reset the map's physics
   * system, such as when changing maps or restarting a level.
   * 
   * @example
   * ```ts
   * // Clear all physics when changing maps
   * map.clearPhysic();
   * 
   * // Then reload physics for the new map
   * map.loadPhysic();
   * ```
   */
  clearPhysic() {
    // Unsubscribe from tick to stop physics updates
    if (this.tickSubscription) {
      this.tickSubscription.unsubscribe();
      this.tickSubscription = null;
    }

    if (this.playersSubscription) {
      this.playersSubscription.unsubscribe();
      this.playersSubscription = null;
    }

    if (this.eventsSubscription) {
      this.eventsSubscription.unsubscribe();
      this.eventsSubscription = null;
    }

    // Clear all hitboxes and zones from physics system
    this.physic.clearAll();
    
    // Reset movement manager
    this.moveManager.clearAll();
  }

  loadPhysic() {
    this.clearPhysic();

    const hitboxes: Array<
      | { id?: string; x: number; y: number; width: number; height: number }
      | { id?: string; points: number[][] }
    > = this.data()?.hitboxes ?? [];

    const gap = 100;
    this.physic.addStaticHitbox('map-width-left', -gap, 0, gap, this.data().height);
    this.physic.addStaticHitbox('map-width-right', this.data().width, 0, gap, this.data().height);
    this.physic.addStaticHitbox('map-height-top', 0, -gap, this.data().width, gap);
    this.physic.addStaticHitbox('map-height-bottom', 0, this.data().height, this.data().width, gap);

    for (let staticHitbox of hitboxes) {
      if ('x' in staticHitbox) {
        this.physic.addStaticHitbox(staticHitbox.id ?? generateShortUUID(), staticHitbox.x, staticHitbox.y, staticHitbox.width, staticHitbox.height);
      }
      else if ('points' in staticHitbox) {
        this.physic.addStaticHitbox(staticHitbox.id ?? generateShortUUID(), staticHitbox.points);
      }
    }
    
    this.playersSubscription = (this.players as any).observable.subscribe(({ value: player, type, key }: any) => { 
      if (type == 'add') {
        player.id = key
        this.physic.addMovableHitbox(player, player.x(), player.y(), player.hitbox().w, player.hitbox().h, {}, {
          enabled: true,
          friction: 0.8,
          minVelocity: 0.5
        });
        this.physic.registerMovementEvents(player.id, () => {
          player.animationName.set('walk')
        }, () => {
          player.animationName.set('stand')
        })
      }
      else if (type == 'remove') {
        this.physic.removeHitbox(player.id)
      }
      else if (type == 'update') {
        this.physic.removeHitbox(player.id)
        this.physic.addMovableHitbox(player, player.x(), player.y(), player.hitbox().w, player.hitbox().h, {}, {
          enabled: true,
          friction: 0.8,
          minVelocity: 0.5
        });
      }
    })

    this.eventsSubscription = this.events.observable.subscribe(({ value: event, type, key }) => {
      if (type == 'add') {
        event.id = key
        // Events are static by default (cannot be pushed) unless they are moving
        // This prevents the player from pushing events during collisions
        this.physic.addMovableHitbox(event, event.x(), event.y(), event.hitbox().w, event.hitbox().h, {
          isStatic: true
        });
        this.physic.registerMovementEvents(event.id, () => {
          event.animationName.set('walk')
          // When event starts moving, make it dynamic
          this.physic.setBodyStatic(event.id, false);
        }, () => {
          event.animationName.set('stand')
          // When event stops moving, make it static again
          this.physic.setBodyStatic(event.id, true);
        })
      }
      else if (type == 'remove') {
        this.physic.removeHitbox(event.id);
      }
    });

    this.tickSubscription = this.tick$.subscribe(({ delta }) => {
      this.physic.update(delta);
      this.moveManager.update(delta, this.physic);
    });
  }

  async movePlayer(player: T, direction: Direction) {
    // Calculate next position before movement
    const currentX = player.x();
    const currentY = player.y();
    const speed = player.speed();

    let nextX = currentX;
    let nextY = currentY;
    
    switch (direction) {
      case Direction.Left:
        nextX = currentX - speed;
        break;
      case Direction.Right:
        nextX = currentX + speed;
        break;
      case Direction.Up:
        nextY = currentY - speed;
        break;
      case Direction.Down:
        nextY = currentY + speed;
        break;
    }

    // Ensure player's facing/intended direction is updated before auto-change evaluation
    if (typeof (player as any).setIntendedDirection === 'function') {
      (player as any).setIntendedDirection(direction);
    } else if (typeof (player as any).changeDirection === 'function') {
      (player as any).changeDirection(direction);
    }

    // Check for automatic map change if the method exists
    if (typeof (player as any).autoChangeMap === 'function') {
      const mapChanged = await (player as any).autoChangeMap({ x: nextX, y: nextY }, direction);
      if (mapChanged) {
        return; // Don't continue movement if map changed
      }
    }
    // Perform normal movement
    this.physic.moveBody(player, direction);
  }

  /**
   * Register movement events for a player or event
   * 
   * Attaches event listeners to detect when an entity starts or stops moving
   * 
   * @param id - ID of the entity (player or event)
   * @param onStartMoving - Callback when entity starts moving
   * @param onStopMoving - Callback when entity stops moving
   * @returns Boolean indicating success
   * 
   * @example
   * ```ts
   * // Register movement events for the player
   * map.registerMovementEvents('player1', 
   *   () => console.log('Player started moving'),
   *   () => console.log('Player stopped moving')
   * );
   * ```
   */
  registerMovementEvents(
    id: string,
    onStartMoving?: () => void,
    onStopMoving?: () => void
  ): boolean {
    // Check if the object with this ID exists
    const object = this.getObjectById(id);
    if (!object) return false;
    
    // Register with physics system
    this.physic.registerMovementEvents(id, onStartMoving, onStopMoving);
    return true;
  }

  /**
   * Check if an entity is currently moving
   * 
   * @param id - ID of the entity to check
   * @returns Boolean indicating if the entity is in motion
   * 
   * @example
   * ```ts
   * // Check if player is moving
   * if (map.isMoving('player1')) {
   *   // Player is in motion
   * }
   * ```
   */
  isMoving(id: string): boolean {
    return this.physic.isMoving(id);
  }

  getObjectById(id: string) {
    return this.players()[id] ?? this.events()[id];
  }

  /**
   * Get the world maps manager
   * 
   * @returns WorldMapsManager instance or null if not configured
   * 
   * @example
   * ```ts
   * const worldMaps = map.getWorldMapsManager();
   * if (worldMaps) {
   *   const adjacentMaps = worldMaps.getAdjacentMaps(currentMap, coordinates);
   * }
   * ```
   */
  getWorldMapsManager(): WorldMapsManager | null {
    return this.worldMapsManager ?? null;
  }

  /**
   * Get attached World
   * 
   * Recover the world attached to this map (undefined if no world attached)
   * 
   * @since 3.0.0-beta.8
   * @returns {RpgWorldMaps | undefined} The world maps manager instance if attached, otherwise undefined
   * 
   * @example
   * ```ts
   * const world = map.getInWorldMaps();
   * if (world) {
   *   console.log(world.getAllMaps());
   * }
   * ```
   */
  getInWorldMaps(): RpgWorldMaps | undefined {
    return this.worldMapsManager ?? undefined;
  }

  /**
   * Remove this map from the world
   * 
   * Remove this map from the world
   * 
   * @since 3.0.0-beta.8
   * @returns {boolean | undefined} True if removed, false if not found, undefined if no world attached
   * 
   * @example
   * ```ts
   * const removed = map.removeFromWorldMaps();
   * ```
   */
  removeFromWorldMaps(): boolean | undefined {
    if (!this.worldMapsManager) return undefined;
    const id = (this as any).id as string | undefined;
    if (!id) return false;
    return this.worldMapsManager.removeMap(id);
  }

  /**
   * Assign the map to a world
   * 
   * Assign the map to a world
   * 
   * @since 3.0.0-beta.8
   * @param {RpgWorldMaps} worldMap world maps
   * @returns {void}
   * 
   * @example
   * ```ts
   * const world = new WorldMapsManager();
   * world.configure([{ id: 'm1', worldX: 0, worldY: 0, width: 1024, height: 1024 }]);
   * map.setInWorldMaps(world);
   * ```
   */
  setInWorldMaps(worldMap: RpgWorldMaps): void {
    this.worldMapsManager = worldMap;
  }

  /**
   * Create a temporary and moving hitbox on the map
   * 
   * Allows to create a temporary hitbox that moves through multiple positions sequentially.
   * For example, you can use it to explode a bomb and find all the affected players, 
   * or during a sword strike, you can create a moving hitbox and find the affected players.
   * 
   * The method creates a zone sensor that moves through the specified hitbox positions
   * at the given speed, detecting collisions with players and events at each step.
   * 
   * @param hitboxes - Array of hitbox positions to move through sequentially
   * @param options - Configuration options for the movement
   * @returns Observable that emits arrays of hit entities and completes when movement is finished
   * 
   * @example
   * ```ts
   * // Create a sword slash effect that moves through two positions
   * map.createMovingHitbox([
   *   { x: 100, y: 100, width: 50, height: 50 },
   *   { x: 120, y: 100, width: 50, height: 50 }
   * ], { speed: 2 }).subscribe({
   *   next(hits) {
   *     // hits contains RpgPlayer or RpgEvent objects that were hit
   *     console.log('Hit entities:', hits);
   *   },
   *   complete() {
   *     console.log('Movement finished');
   *   }
   * });
   * ```
   */
  createMovingHitbox(
    hitboxes: Array<{ x: number; y: number; width: number; height: number }>,
    options: { speed?: number } = {}
  ): Observable<(T | any)[]> {
    const { speed = 1 } = options;
    const zoneId = `moving_hitbox_${generateShortUUID()}`;
    
    return new Observable(observer => {
      if (hitboxes.length === 0) {
        observer.complete();
        return;
      }

      let currentIndex = 0;
      let frameCounter = 0;
      const hitEntities = new Set<string>();

      // Create initial zone at first hitbox position
      const firstHitbox = hitboxes[0];
      const radius = Math.max(firstHitbox.width, firstHitbox.height) / 2;
      
      this.physic.addZone(zoneId, {
        x: firstHitbox.x + firstHitbox.width / 2,
        y: firstHitbox.y + firstHitbox.height / 2,
        radius: radius
      });

      // Register zone events to detect hits
      this.physic.registerZoneEvents(
        zoneId,
        (hitIds: string[]) => {
          // Convert hit IDs to actual objects and emit
          const hitObjects = hitIds
            .map(id => this.getObjectById(id))
            .filter(obj => obj !== undefined);
          
          if (hitObjects.length > 0) {
            // Track hit entities to avoid duplicates
            hitIds.forEach(id => hitEntities.add(id));
            observer.next(hitObjects);
          }
        }
      );

      // Subscribe to tick to handle movement
      const tickSubscription = this.tick$.subscribe(() => {
        frameCounter++;
        
        // Move to next position based on speed
        if (frameCounter >= speed) {
          frameCounter = 0;
          currentIndex++;
          
          // Check if we've reached the end
          if (currentIndex >= hitboxes.length) {
            // Clean up and complete
            this.physic.removeZone(zoneId);
            tickSubscription.unsubscribe();
            observer.complete();
            return;
          }
          
          // Move zone to next position
          const nextHitbox = hitboxes[currentIndex];
          const zone = this.physic.getZone(zoneId);
          
          if (zone) {
            // Remove current zone and create new one at next position
            this.physic.removeZone(zoneId);
            
            const newRadius = Math.max(nextHitbox.width, nextHitbox.height) / 2;
            this.physic.addZone(zoneId, {
              x: nextHitbox.x + nextHitbox.width / 2,
              y: nextHitbox.y + nextHitbox.height / 2,
              radius: newRadius
            });
            
            // Re-register zone events for the new zone
            this.physic.registerZoneEvents(
              zoneId,
              (hitIds: string[]) => {
                const hitObjects = hitIds
                  .map(id => this.getObjectById(id))
                  .filter(obj => obj !== undefined);
                
                if (hitObjects.length > 0) {
                  hitIds.forEach(id => hitEntities.add(id));
                  observer.next(hitObjects);
                }
              }
            );
          }
        }
      });

      // Cleanup function
      return () => {
        tickSubscription.unsubscribe();
        this.physic.removeZone(zoneId);
      };
    });
  }
}
