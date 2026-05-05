import { Entity } from '../physics/Entity';
import { Collider } from './Collider';

const colliderCache: WeakMap<Entity, Collider> = new WeakMap();

export function getCachedCollider(entity: Entity): Collider | undefined {
  return colliderCache.get(entity);
}

export function setCachedCollider(entity: Entity, collider: Collider): void {
  colliderCache.set(entity, collider);
}

export function invalidateCollider(entity: Entity): void {
  colliderCache.delete(entity);
}
