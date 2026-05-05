import { Vector2 } from '../core/math/Vector2';
import type { Entity } from '../physics/Entity';
import type { RaycastHit } from '../collision/raycast';
import type { PhysicsEngine } from '../api/PhysicsEngine';

export type ProjectileDestroyReason = 'hit' | 'range' | 'ttl' | 'manual';

export interface ProjectileSpawnConfig {
  id: string;
  ownerId?: string;
  origin: Vector2 | { x: number; y: number };
  direction: Vector2 | { x: number; y: number };
  speed: number;
  range?: number;
  ttl?: number;
  spawnTick?: number;
  collisionMask?: number;
  ignoreOwner?: boolean;
  filter?: (entity: Entity, projectile: ProjectileState) => boolean;
  metadata?: Record<string, unknown>;
}

export interface ProjectileState {
  id: string;
  ownerId?: string;
  origin: Vector2;
  position: Vector2;
  direction: Vector2;
  speed: number;
  range: number;
  ttl: number;
  spawnTick: number;
  age: number;
  distanceTraveled: number;
  collisionMask?: number;
  ignoreOwner: boolean;
  metadata?: Record<string, unknown>;
}

export interface ProjectileSpawnEvent {
  projectile: ProjectileState;
}

export interface ProjectileHitEvent {
  projectile: ProjectileState;
  hit: RaycastHit;
}

export interface ProjectileDestroyEvent {
  projectile: ProjectileState;
  reason: ProjectileDestroyReason;
  hit?: RaycastHit;
}

export interface ProjectileSystemOptions {
  defaultTtl?: number;
  defaultRange?: number;
}

export type ProjectileHandler<T> = (event: T) => void;

interface ProjectileRecord {
  state: ProjectileState;
  filter?: (entity: Entity, projectile: ProjectileState) => boolean;
}

/**
 * Lightweight deterministic projectile simulation for server-authoritative RPGs.
 *
 * Projectiles are not registered as physics entities. Each step raycasts the
 * segment traveled by each projectile and emits spawn, hit, and destroy events.
 */
export class ProjectileSystem {
  private readonly projectiles = new Map<string, ProjectileRecord>();
  private readonly spawnHandlers = new Set<ProjectileHandler<ProjectileSpawnEvent>>();
  private readonly hitHandlers = new Set<ProjectileHandler<ProjectileHitEvent>>();
  private readonly destroyHandlers = new Set<ProjectileHandler<ProjectileDestroyEvent>>();

  constructor(
    private readonly engine: PhysicsEngine,
    private readonly options: ProjectileSystemOptions = {},
  ) {}

  public spawn(config: ProjectileSpawnConfig): ProjectileState {
    if (this.projectiles.has(config.id)) {
      throw new Error(`Projectile "${config.id}" already exists`);
    }

    const direction = this.toVector(config.direction).normalizeInPlace();
    if (direction.lengthSquared() === 0) {
      throw new Error('Projectile direction must be non-zero');
    }

    const speed = config.speed;
    if (!Number.isFinite(speed) || speed <= 0) {
      throw new Error('Projectile speed must be a positive number');
    }

    const rangeOption = config.range ?? this.options.defaultRange;
    if (rangeOption === undefined || !Number.isFinite(rangeOption) || rangeOption <= 0) {
      throw new Error('Projectile range must be a positive number');
    }

    const ttlOption = config.ttl ?? this.options.defaultTtl;
    if (ttlOption === undefined || !Number.isFinite(ttlOption) || ttlOption <= 0) {
      throw new Error('Projectile ttl must be a positive number');
    }

    const origin = this.toVector(config.origin);
    const state: ProjectileState = {
      id: config.id,
      origin: origin.clone(),
      position: origin.clone(),
      direction,
      speed,
      range: rangeOption,
      ttl: ttlOption,
      spawnTick: config.spawnTick ?? this.engine.getTick(),
      age: 0,
      distanceTraveled: 0,
      ignoreOwner: config.ignoreOwner ?? true,
    };

    if (config.ownerId !== undefined) state.ownerId = config.ownerId;
    if (config.collisionMask !== undefined) state.collisionMask = config.collisionMask;
    if (config.metadata !== undefined) state.metadata = config.metadata;

    const record: ProjectileRecord = { state };
    if (config.filter !== undefined) record.filter = config.filter;
    this.projectiles.set(config.id, record);
    this.emit(this.spawnHandlers, { projectile: this.cloneState(state) });
    return this.cloneState(state);
  }

  public step(dt = 1 / 60): void {
    if (!Number.isFinite(dt) || dt <= 0) {
      return;
    }

    const records = Array.from(this.projectiles.values());
    for (const record of records) {
      if (!this.projectiles.has(record.state.id)) {
        continue;
      }
      this.stepProjectile(record, dt);
    }
  }

  public destroy(id: string, reason: ProjectileDestroyReason = 'manual'): boolean {
    const record = this.projectiles.get(id);
    if (!record) {
      return false;
    }
    this.destroyRecord(record, reason);
    return true;
  }

  public getProjectile(id: string): ProjectileState | undefined {
    const record = this.projectiles.get(id);
    return record ? this.cloneState(record.state) : undefined;
  }

  public getProjectiles(): ProjectileState[] {
    return Array.from(this.projectiles.values(), (record) => this.cloneState(record.state));
  }

  public clear(): void {
    this.projectiles.clear();
  }

  public onSpawn(handler: ProjectileHandler<ProjectileSpawnEvent>): () => void {
    this.spawnHandlers.add(handler);
    return () => this.spawnHandlers.delete(handler);
  }

  public onHit(handler: ProjectileHandler<ProjectileHitEvent>): () => void {
    this.hitHandlers.add(handler);
    return () => this.hitHandlers.delete(handler);
  }

  public onDestroy(handler: ProjectileHandler<ProjectileDestroyEvent>): () => void {
    this.destroyHandlers.add(handler);
    return () => this.destroyHandlers.delete(handler);
  }

  private stepProjectile(record: ProjectileRecord, dt: number): void {
    const projectile = record.state;
    const remainingTtl = projectile.ttl - projectile.age;
    const remainingRange = projectile.range - projectile.distanceTraveled;
    const stepTime = Math.min(dt, remainingTtl);
    const stepDistance = Math.min(projectile.speed * stepTime, remainingRange);

    if (stepTime <= 0) {
      this.destroyRecord(record, 'ttl');
      return;
    }

    if (stepDistance <= 0) {
      this.destroyRecord(record, 'range');
      return;
    }

    const start = projectile.position.clone();
    const hit = this.engine.raycast(
      start,
      projectile.direction,
      stepDistance,
      projectile.collisionMask,
      (entity) => this.shouldHit(entity, record),
    );

    if (hit) {
      projectile.position = hit.point.clone();
      projectile.distanceTraveled += hit.distance;
      projectile.age += hit.distance / projectile.speed;
      this.emit(this.hitHandlers, {
        projectile: this.cloneState(projectile),
        hit,
      });
      this.destroyRecord(record, 'hit', hit);
      return;
    }

    projectile.position = start.add(projectile.direction.mul(stepDistance));
    projectile.distanceTraveled += stepDistance;
    projectile.age += stepTime;

    if (projectile.distanceTraveled >= projectile.range) {
      this.destroyRecord(record, 'range');
      return;
    }

    if (projectile.age >= projectile.ttl) {
      this.destroyRecord(record, 'ttl');
    }
  }

  private shouldHit(entity: Entity, record: ProjectileRecord): boolean {
    const projectile = record.state;
    if (projectile.ignoreOwner && projectile.ownerId !== undefined && entity.uuid === projectile.ownerId) {
      return false;
    }
    return record.filter ? record.filter(entity, this.cloneState(projectile)) : true;
  }

  private destroyRecord(record: ProjectileRecord, reason: ProjectileDestroyReason, hit?: RaycastHit): void {
    if (!this.projectiles.delete(record.state.id)) {
      return;
    }
    const event: ProjectileDestroyEvent = {
      projectile: this.cloneState(record.state),
      reason,
    };
    if (hit !== undefined) event.hit = hit;
    this.emit(this.destroyHandlers, event);
  }

  private cloneState(state: ProjectileState): ProjectileState {
    const clone: ProjectileState = {
      id: state.id,
      origin: state.origin.clone(),
      position: state.position.clone(),
      direction: state.direction.clone(),
      speed: state.speed,
      range: state.range,
      ttl: state.ttl,
      spawnTick: state.spawnTick,
      age: state.age,
      distanceTraveled: state.distanceTraveled,
      ignoreOwner: state.ignoreOwner,
    };
    if (state.ownerId !== undefined) clone.ownerId = state.ownerId;
    if (state.collisionMask !== undefined) clone.collisionMask = state.collisionMask;
    if (state.metadata !== undefined) clone.metadata = state.metadata;
    return clone;
  }

  private toVector(value: Vector2 | { x: number; y: number }): Vector2 {
    return value instanceof Vector2 ? value.clone() : new Vector2(value.x, value.y);
  }

  private emit<T>(handlers: Set<ProjectileHandler<T>>, event: T): void {
    for (const handler of handlers) {
      handler(event);
    }
  }
}
