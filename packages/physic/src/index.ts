/**
 * RPG Physic - A deterministic 2D top-down physics library
 * 
 * @packageDocumentation
 */

// Core Math Layer
export { Vector2 } from './core/math/Vector2';
export { Matrix2 } from './core/math/Matrix2';
export { AABB } from './core/math/AABB';
export * from './core/math/utils';
export * from './core/types';

// Physics Layer
export { Entity, type EntityConfig } from './physics/Entity';
export { Integrator, IntegrationMethod } from './physics/integrator';
export * from './physics/forces';
export * from './physics/constraints';

// Collision Layer
export type { Collider, CollisionInfo, ContactPoint } from './collision/Collider';
export { CircleCollider } from './collision/CircleCollider';
export { AABBCollider } from './collision/AABBCollider';
export { SpatialHash } from './collision/spatial-hash';
export { Quadtree } from './collision/quadtree';
export { BVH } from './collision/bvh';
export { CollisionResolver } from './collision/resolver';
export * from './collision/detector';
export { PolygonCollider, assignPolygonCollider, type PolygonConfig } from './collision/PolygonCollider';
export { raycast, type RaycastHit } from './collision/raycast';
export { sweepEntities, type SweepResult } from './collision/sweep';

// World Layer
export { World, type WorldConfig } from './world/World';
export { EventSystem } from './world/events';
export type { SpatialPartition } from './world/SpatialPartition';

// Region Layer
export { Region, type RegionConfig } from './region/Region';
export { RegionManager, type RegionManagerConfig } from './region/RegionManager';
export * from './region/migration';

// API Layer
export { PhysicsEngine, type PhysicsEngineConfig } from './api/PhysicsEngine';

// Movement System
export * from './movement';

// Utils
export { ObjectPool } from './utils/pool';
export * from './utils/uuid';

export { ProjectileType } from './movement/strategies/ProjectileMovement';
