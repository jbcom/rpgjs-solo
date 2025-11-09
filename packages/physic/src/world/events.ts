import { Entity } from '../physics/Entity';
import { CollisionInfo } from '../collision/Collider';

/**
 * Event handler types
 */
export type CollisionEventHandler = (collision: CollisionInfo) => void;
export type EntityEventHandler = (entity: Entity) => void;
export type SleepEventHandler = (entity: Entity) => void;
export type WakeEventHandler = (entity: Entity) => void;

/**
 * Event system for physics world
 * 
 * Manages event handlers for collisions, entity lifecycle, and other physics events.
 */
export class EventSystem {
  private collisionEnterHandlers: Set<CollisionEventHandler> = new Set();
  private collisionExitHandlers: Set<CollisionEventHandler> = new Set();
  private entityAddedHandlers: Set<EntityEventHandler> = new Set();
  private entityRemovedHandlers: Set<EntityEventHandler> = new Set();
  private entitySleepHandlers: Set<SleepEventHandler> = new Set();
  private entityWakeHandlers: Set<WakeEventHandler> = new Set();

  /**
   * Registers a collision enter handler
   * 
   * @param handler - Handler function
   * @returns Unsubscribe function
   */
  public onCollisionEnter(handler: CollisionEventHandler): () => void {
    this.collisionEnterHandlers.add(handler);
    return () => this.collisionEnterHandlers.delete(handler);
  }

  /**
   * Registers a collision exit handler
   * 
   * @param handler - Handler function
   * @returns Unsubscribe function
   */
  public onCollisionExit(handler: CollisionEventHandler): () => void {
    this.collisionExitHandlers.add(handler);
    return () => this.collisionExitHandlers.delete(handler);
  }

  /**
   * Registers an entity added handler
   * 
   * @param handler - Handler function
   * @returns Unsubscribe function
   */
  public onEntityAdded(handler: EntityEventHandler): () => void {
    this.entityAddedHandlers.add(handler);
    return () => this.entityAddedHandlers.delete(handler);
  }

  /**
   * Registers an entity removed handler
   * 
   * @param handler - Handler function
   * @returns Unsubscribe function
   */
  public onEntityRemoved(handler: EntityEventHandler): () => void {
    this.entityRemovedHandlers.add(handler);
    return () => this.entityRemovedHandlers.delete(handler);
  }

  /**
   * Registers an entity sleep handler
   * 
   * @param handler - Handler function
   * @returns Unsubscribe function
   */
  public onEntitySleep(handler: SleepEventHandler): () => void {
    this.entitySleepHandlers.add(handler);
    return () => this.entitySleepHandlers.delete(handler);
  }

  /**
   * Registers an entity wake handler
   * 
   * @param handler - Handler function
   * @returns Unsubscribe function
   */
  public onEntityWake(handler: WakeEventHandler): () => void {
    this.entityWakeHandlers.add(handler);
    return () => this.entityWakeHandlers.delete(handler);
  }

  /**
   * Emits a collision enter event
   * 
   * @param collision - Collision information
   */
  public emitCollisionEnter(collision: CollisionInfo): void {
    for (const handler of this.collisionEnterHandlers) {
      handler(collision);
    }
  }

  /**
   * Emits a collision exit event
   * 
   * @param collision - Collision information
   */
  public emitCollisionExit(collision: CollisionInfo): void {
    for (const handler of this.collisionExitHandlers) {
      handler(collision);
    }
  }

  /**
   * Emits an entity added event
   * 
   * @param entity - Entity that was added
   */
  public emitEntityAdded(entity: Entity): void {
    for (const handler of this.entityAddedHandlers) {
      handler(entity);
    }
  }

  /**
   * Emits an entity removed event
   * 
   * @param entity - Entity that was removed
   */
  public emitEntityRemoved(entity: Entity): void {
    for (const handler of this.entityRemovedHandlers) {
      handler(entity);
    }
  }

  /**
   * Emits an entity sleep event
   * 
   * @param entity - Entity that went to sleep
   */
  public emitEntitySleep(entity: Entity): void {
    for (const handler of this.entitySleepHandlers) {
      handler(entity);
    }
  }

  /**
   * Emits an entity wake event
   * 
   * @param entity - Entity that woke up
   */
  public emitEntityWake(entity: Entity): void {
    for (const handler of this.entityWakeHandlers) {
      handler(entity);
    }
  }

  /**
   * Clears all event handlers
   */
  public clear(): void {
    this.collisionEnterHandlers.clear();
    this.collisionExitHandlers.clear();
    this.entityAddedHandlers.clear();
    this.entityRemovedHandlers.clear();
    this.entitySleepHandlers.clear();
    this.entityWakeHandlers.clear();
  }
}

