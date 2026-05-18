import { computed, signal } from "canvasengine";
import { Hooks } from "@rpgjs/common";

export interface ClientProjectileSpawn {
  id: string;
  type: string;
  ownerId?: string;
  origin: { x: number; y: number };
  direction: { x: number; y: number };
  speed: number;
  range: number;
  ttl: number;
  spawnTick: number;
  delay?: number;
  index?: number;
  count?: number;
  params?: Record<string, unknown>;
  collisionMask?: number;
  ignoreOwner?: boolean;
  predictImpact?: boolean;
}

export interface ClientProjectileImpact {
  id: string;
  targetId?: string;
  x: number;
  y: number;
  distance?: number;
}

export interface ClientProjectileDestroy {
  id: string;
  reason?: string;
  targetId?: string;
  x?: number;
  y?: number;
  distance?: number;
}

export interface RenderedProjectileProps extends ClientProjectileSpawn {
  x: number;
  y: number;
  angle: number;
  distance: number;
  elapsed: number;
  progress: number;
  impact?: ClientProjectileImpact;
  impactElapsed?: number;
  impactProgress?: number;
  destroyed?: boolean;
}

export interface RenderedProjectile {
  id: string;
  type: string;
  component: any;
  props: RenderedProjectileProps;
}

export type ProjectilePredictionResolver = (
  projectile: ClientProjectileSpawn,
) => ClientProjectileImpact | null | undefined;

export interface ProjectileSpawnClock {
  now?: number;
  currentServerTick?: number;
  tickDurationMs?: number;
}

interface RuntimeProjectile {
  spawn: ClientProjectileSpawn;
  component: any;
  createdAt: number;
  impact?: ClientProjectileImpact;
  visualImpact?: ClientProjectileImpact;
  predictedImpact?: ClientProjectileImpact;
  impactStartedAt?: number;
  destroyAt?: number;
  destroyReason?: string;
}

export class ProjectileManager {
  private readonly components = new Map<string, any>();
  private readonly projectiles = new Map<string, RuntimeProjectile>();
  private readonly version = signal(0);
  private readonly impactDurationMs = 350;

  constructor(
    private readonly hooks: Hooks,
    private readonly predictionResolver?: ProjectilePredictionResolver,
  ) {}

  current = computed<RenderedProjectile[]>(() => {
    this.version();
    const now = Date.now();
    const rendered: RenderedProjectile[] = [];
    for (const projectile of this.projectiles.values()) {
      const props = this.toProps(projectile, now);
      if (!props) {
        continue;
      }
      rendered.push({
        id: projectile.spawn.id,
        type: projectile.spawn.type,
        component: projectile.component,
        props,
      });
    }
    return rendered;
  });

  register(type: string, component: any): any {
    this.components.set(type, component);
    return component;
  }

  get(type: string): any {
    return this.components.get(type);
  }

  spawnBatch(projectiles: ClientProjectileSpawn[], clock: ProjectileSpawnClock = {}): void {
    const now = clock.now ?? Date.now();
    for (const projectile of projectiles) {
      const component = this.components.get(projectile.type);
      if (!component) {
        continue;
      }
      const runtime: RuntimeProjectile = {
        spawn: {
          ...projectile,
          delay: projectile.delay ?? 0,
          index: projectile.index ?? 0,
          count: projectile.count ?? 1,
        },
        component,
        createdAt: now,
      };
      this.setPredictedImpact(runtime);
      this.projectiles.set(projectile.id, runtime);
      this.hooks.callHooks("client-projectiles-onSpawn", runtime.spawn).subscribe();
    }
    this.touch();
  }

  impactBatch(impacts: ClientProjectileImpact[]): void {
    const now = Date.now();
    for (const impact of impacts) {
      const projectile = this.projectiles.get(impact.id);
      if (!projectile) {
        continue;
      }
      this.setImpact(projectile, impact, now);
      this.hooks.callHooks("client-projectiles-onImpact", this.toProps(projectile, now)).subscribe();
    }
    this.touch();
  }

  destroyBatch(projectiles: ClientProjectileDestroy[]): void {
    const now = Date.now();
    for (const destroyed of projectiles) {
      const projectile = this.projectiles.get(destroyed.id);
      if (!projectile) {
        continue;
      }
      if (destroyed.reason === "hit") {
        const current = this.toProps(projectile, now);
        this.setImpact(projectile, {
          id: destroyed.id,
          targetId: destroyed.targetId ?? projectile.impact?.targetId,
          x: destroyed.x ?? projectile.impact?.x ?? current?.x ?? projectile.spawn.origin.x,
          y: destroyed.y ?? projectile.impact?.y ?? current?.y ?? projectile.spawn.origin.y,
          distance: destroyed.distance ?? projectile.impact?.distance ?? current?.distance,
        }, now);
      }
      projectile.destroyReason = destroyed.reason;
      projectile.destroyAt = projectile.destroyAt ?? (
        projectile.impact && projectile.impactStartedAt !== undefined
          ? projectile.impactStartedAt + this.impactDurationMs
          : now
      );
      this.hooks.callHooks("client-projectiles-onDestroy", this.toProps(projectile, now)).subscribe();
    }
    this.touch();
  }

  clear(): void {
    this.projectiles.clear();
    this.touch();
  }

  step(): void {
    const now = Date.now();
    let changed = false;
    for (const [id, projectile] of this.projectiles) {
      const props = this.toProps(projectile, now);
      if (
        (!props && !this.isWaitingForDelay(projectile, now)) ||
        (projectile.destroyAt !== undefined && now >= projectile.destroyAt)
      ) {
        this.projectiles.delete(id);
        changed = true;
      }
    }
    this.touch(changed || this.projectiles.size > 0);
  }

  private toProps(projectile: RuntimeProjectile, now: number): RenderedProjectileProps | null {
    const spawn = projectile.spawn;
    const delayMs = (spawn.delay ?? 0) * 1000;
    const elapsedMs = now - projectile.createdAt - delayMs;
    if (elapsedMs < 0) {
      return null;
    }
    const elapsed = elapsedMs / 1000;
    const ttl = Math.max(0.001, spawn.ttl);
    const rawDistance = Math.min(spawn.speed * elapsed, spawn.range);
    const predictedImpact = this.getActivePredictedImpact(projectile, now, rawDistance);
    const visualImpact = projectile.visualImpact ?? projectile.impact;
    const distance = visualImpact?.distance ?? predictedImpact?.distance ?? rawDistance;
    const progress = Math.min(1, distance / spawn.range);
    const x = visualImpact?.x ?? predictedImpact?.x ?? spawn.origin.x + spawn.direction.x * distance;
    const y = visualImpact?.y ?? predictedImpact?.y ?? spawn.origin.y + spawn.direction.y * distance;
    const impactElapsedMs = projectile.impactStartedAt !== undefined
      ? Math.max(0, now - projectile.impactStartedAt)
      : undefined;
    return {
      ...spawn,
      x,
      y,
      angle: Math.atan2(spawn.direction.y, spawn.direction.x),
      distance,
      elapsed,
      progress,
      impact: projectile.impact,
      impactElapsed: impactElapsedMs === undefined ? undefined : impactElapsedMs / 1000,
      impactProgress: impactElapsedMs === undefined
        ? undefined
        : Math.min(1, impactElapsedMs / this.impactDurationMs),
      destroyed: projectile.destroyAt !== undefined,
      ttl,
    };
  }

  private isWaitingForDelay(projectile: RuntimeProjectile, now: number): boolean {
    const delayMs = (projectile.spawn.delay ?? 0) * 1000;
    return now - projectile.createdAt - delayMs < 0;
  }

  private setPredictedImpact(projectile: RuntimeProjectile): void {
    if (projectile.spawn.predictImpact === false) {
      return;
    }
    const impact = this.predictionResolver?.(projectile.spawn);
    if (!impact || !Number.isFinite(impact.x) || !Number.isFinite(impact.y)) {
      return;
    }
    const distance = typeof impact.distance === "number" && Number.isFinite(impact.distance)
      ? impact.distance
      : Math.hypot(impact.x - projectile.spawn.origin.x, impact.y - projectile.spawn.origin.y);
    if (!Number.isFinite(distance) || distance < 0 || distance > projectile.spawn.range) {
      return;
    }
    projectile.predictedImpact = {
      ...impact,
      distance,
    };
  }

  private getActivePredictedImpact(
    projectile: RuntimeProjectile,
    now: number,
    rawDistance: number,
  ): ClientProjectileImpact | undefined {
    if (!projectile.predictedImpact || projectile.impact) {
      return undefined;
    }
    const distance = projectile.predictedImpact.distance;
    if (distance === undefined || rawDistance < distance) {
      return undefined;
    }
    return projectile.predictedImpact;
  }

  private setImpact(projectile: RuntimeProjectile, impact: ClientProjectileImpact, now: number): void {
    projectile.visualImpact = this.resolveVisualImpact(projectile, impact, now);
    projectile.impact = impact;
    projectile.predictedImpact = undefined;
    projectile.impactStartedAt = projectile.impactStartedAt ?? now;
    const impactDestroyAt = projectile.impactStartedAt + this.impactDurationMs;
    projectile.destroyAt = Math.max(projectile.destroyAt ?? 0, impactDestroyAt);
  }

  private resolveVisualImpact(
    projectile: RuntimeProjectile,
    impact: ClientProjectileImpact,
    now: number,
  ): ClientProjectileImpact {
    const predicted = projectile.predictedImpact;
    if (!predicted || !this.isSameTarget(predicted, impact)) {
      return impact;
    }
    const distance = predicted.distance;
    if (distance === undefined) {
      return impact;
    }
    const delayMs = (projectile.spawn.delay ?? 0) * 1000;
    const elapsedMs = now - projectile.createdAt - delayMs;
    if (elapsedMs < 0) {
      return impact;
    }
    const rawDistance = Math.min(projectile.spawn.speed * (elapsedMs / 1000), projectile.spawn.range);
    return rawDistance >= distance ? predicted : impact;
  }

  private isSameTarget(a: ClientProjectileImpact, b: ClientProjectileImpact): boolean {
    return a.targetId !== undefined && a.targetId === b.targetId;
  }

  private touch(force = true): void {
    if (force) {
      this.version.update((value) => value + 1);
    }
  }
}
