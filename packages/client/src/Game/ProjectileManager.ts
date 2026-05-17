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
}

export interface RenderedProjectileProps extends ClientProjectileSpawn {
  x: number;
  y: number;
  angle: number;
  distance: number;
  elapsed: number;
  progress: number;
  impact?: ClientProjectileImpact;
  destroyed?: boolean;
}

export interface RenderedProjectile {
  id: string;
  type: string;
  component: any;
  props: RenderedProjectileProps;
}

interface RuntimeProjectile {
  spawn: ClientProjectileSpawn;
  component: any;
  createdAt: number;
  impact?: ClientProjectileImpact;
  destroyAt?: number;
  destroyReason?: string;
}

export class ProjectileManager {
  private readonly components = new Map<string, any>();
  private readonly projectiles = new Map<string, RuntimeProjectile>();
  private readonly version = signal(0);
  private readonly impactDurationMs = 120;

  constructor(private readonly hooks: Hooks) {}

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

  spawnBatch(projectiles: ClientProjectileSpawn[]): void {
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
        createdAt: Date.now(),
      };
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
      projectile.impact = impact;
      projectile.destroyAt = now + this.impactDurationMs;
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
      projectile.destroyReason = destroyed.reason;
      projectile.destroyAt = projectile.destroyAt ?? now;
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
      if (!props || (projectile.destroyAt !== undefined && now >= projectile.destroyAt)) {
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
    const distance = projectile.impact?.distance ?? Math.min(spawn.speed * elapsed, spawn.range);
    const progress = Math.min(1, distance / spawn.range);
    const x = projectile.impact?.x ?? spawn.origin.x + spawn.direction.x * distance;
    const y = projectile.impact?.y ?? spawn.origin.y + spawn.direction.y * distance;
    return {
      ...spawn,
      x,
      y,
      angle: Math.atan2(spawn.direction.y, spawn.direction.x),
      distance,
      elapsed,
      progress,
      impact: projectile.impact,
      destroyed: projectile.destroyAt !== undefined,
      ttl,
    };
  }

  private touch(force = true): void {
    if (force) {
      this.version.update((value) => value + 1);
    }
  }
}
