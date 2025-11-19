import { Entity } from '../physics/Entity';
import { AABB } from '../core/math/AABB';

/**
 * Interface for spatial partitioning systems
 * 
 * Allows different spatial partitioning implementations (spatial hash, quadtree, etc.)
 */
export interface SpatialPartition {
  /**
   * Inserts an entity into the partition
   * 
   * @param entity - Entity to insert
   */
  insert(entity: Entity): void;

  /**
   * Removes an entity from the partition
   * 
   * @param entity - Entity to remove
   */
  remove(entity: Entity): void;

  /**
   * Updates an entity's position in the partition
   * 
   * @param entity - Entity to update
   */
  update(entity: Entity): void;

  /**
   * Queries entities near a given entity
   * 
   * @param entity - Entity to query around
   * @param results - Optional Set to store results in (avoids allocation)
   * @returns Set of nearby entities
   */
  query(entity: Entity, results?: Set<Entity>): Set<Entity>;

  /**
   * Queries entities in an AABB region
   * 
   * @param bounds - AABB to query
   * @returns Set of entities in the region
   */
  queryAABB(bounds: AABB): Set<Entity>;

  /**
   * Clears all entities from the partition
   */
  clear(): void;
}

