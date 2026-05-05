import { Vector2 } from '../../core/math/Vector2';
import { MovementBody, MovementStrategy } from '../MovementStrategy';

/**
 * Type of projectile trajectory.
 */
export enum ProjectileType {
  Straight = 'straight',
  Arc = 'arc',
  Bounce = 'bounce',
}

enum ProjectileStage {
  Flying,
  Rolling,
  Finished,
}

/**
 * Configuration for a projectile trajectory.
 */
export interface ProjectileOptions {
  /** Horizontal speed in units per second */
  speed: number;
  /** Heading direction (will be normalized) */
  direction: { x: number; y: number };
  /** Maximum travel distance (optional) */
  maxRange?: number;
  /** Maximum lifetime in seconds (optional) */
  lifetime?: number;
  /** Initial vertical height */
  initialHeight?: number;
  /** Apex height for arc trajectories */
  maxHeight?: number;
  /** Gravity strength applied to arc/bounce projectiles */
  gravity?: number;
  /** Number of allowed bounces */
  maxBounces?: number;
  /** Energy retained after each bounce (0-1) */
  bounciness?: number;
  /** Drag factor applied per second (0-1) */
  drag?: number;
  /** Optional callback receiving height updates */
  onHeightUpdate?: (height: number, body: MovementBody) => void;
}

/**
 * Moves an entity following a projectile trajectory.
 *
 * @example
 * ```typescript
 * const projectile = new ProjectileMovement(ProjectileType.Arc, {
 *   speed: 12,
 *   direction: { x: 1, y: 0 },
 *   maxHeight: 3,
 *   gravity: 30,
 * });
 * movementManager.add(entity, projectile);
 * ```
 */
export class ProjectileMovement implements MovementStrategy {
  private elapsed = 0;
  private distanceTraveled = 0;
  private startPosition: Vector2 | null = null;
  private bounceCount = 0;
  private stage: ProjectileStage = ProjectileStage.Flying;
  private finished = false;

  private currentHeight = 0;
  private verticalVelocity = 0;
  private readonly direction: { x: number; y: number };

  private readonly options: ProjectileOptions;

  constructor(
    private readonly type: ProjectileType,
    options: ProjectileOptions,
  ) {
    const defaults: ProjectileOptions = {
      speed: options.speed,
      direction: options.direction,
      initialHeight: 0,
      maxHeight: 2,
      gravity: 30,
      maxBounces: 0,
      bounciness: 0.6,
      drag: 0,
    };

    this.options = { ...defaults, ...options };

    const magnitude = Math.hypot(this.options.direction.x, this.options.direction.y);
    this.direction = magnitude > 0
      ? { x: this.options.direction.x / magnitude, y: this.options.direction.y / magnitude }
      : { x: 1, y: 0 };

    this.currentHeight = this.options.initialHeight ?? 0;

    if (this.type === ProjectileType.Arc || this.type === ProjectileType.Bounce) {
      const gravity = this.options.gravity ?? 30;
      const maxHeight = this.options.maxHeight ?? 2;
      this.verticalVelocity = Math.sqrt(Math.max(0, 2 * gravity * maxHeight));
    }
  }

  update(body: MovementBody, dt: number): void {
    if (this.finished || dt <= 0) {
      body.setVelocity({ x: 0, y: 0 });
      return;
    }

    if (this.startPosition === null) {
      this.startPosition = new Vector2(body.position.x, body.position.y);
    }

    this.elapsed += dt;
    if (this.options.lifetime !== undefined && this.elapsed >= this.options.lifetime) {
      this.finish(body);
      return;
    }

    switch (this.stage) {
      case ProjectileStage.Flying:
        this.updateFlying(body, dt);
        break;
      case ProjectileStage.Rolling:
        this.updateRolling(body, dt);
        break;
      case ProjectileStage.Finished:
        this.finish(body);
        return;
    }

    if (this.startPosition) {
      this.distanceTraveled = new Vector2(body.position.x, body.position.y).distanceTo(this.startPosition);
      if (this.options.maxRange !== undefined && this.distanceTraveled >= this.options.maxRange) {
        this.finish(body);
      }
    }
  }

  isFinished(): boolean {
    return this.finished;
  }

  getHeight(): number {
    return this.currentHeight;
  }

  getProgress(): number {
    if (this.options.maxRange) {
      return Math.min(1, this.distanceTraveled / this.options.maxRange);
    }
    if (this.options.lifetime) {
      return Math.min(1, this.elapsed / this.options.lifetime);
    }
    return 0;
  }

  private updateFlying(body: MovementBody, dt: number): void {
    let vx = this.direction.x * this.options.speed;
    let vy = this.direction.y * this.options.speed;

    const drag = Math.max(0, Math.min(1, this.options.drag ?? 0));
    if (drag > 0) {
      const dragFactor = Math.pow(1 - drag, dt);
      vx *= dragFactor;
      vy *= dragFactor;
    }

    if (this.type === ProjectileType.Arc || this.type === ProjectileType.Bounce) {
      const gravity = this.options.gravity ?? 30;
      this.verticalVelocity -= gravity * dt;
      this.currentHeight += this.verticalVelocity * dt;

      this.options.onHeightUpdate?.(this.currentHeight, body);

      if (this.currentHeight <= 0) {
        this.currentHeight = 0;
        if (this.type === ProjectileType.Bounce) {
          if (this.bounceCount < (this.options.maxBounces ?? 0)) {
            const bounceEnergy = this.options.bounciness ?? 0.6;
            this.verticalVelocity = Math.abs(this.verticalVelocity) * bounceEnergy;
            vx *= bounceEnergy;
            vy *= bounceEnergy;
            this.bounceCount += 1;
          } else {
            this.stage = ProjectileStage.Rolling;
          }
        } else {
          this.finish(body);
          return;
        }
      }
    }

    body.setVelocity({ x: vx, y: vy });
  }

  private updateRolling(body: MovementBody, dt: number): void {
    const friction = 0.85;
    const vx = body.velocity.x * Math.pow(friction, dt * 60);
    const vy = body.velocity.y * Math.pow(friction, dt * 60);

    body.setVelocity({ x: vx, y: vy });

    if (Math.abs(vx) < 0.1 && Math.abs(vy) < 0.1) {
      this.finish(body);
    }
  }

  private finish(body: MovementBody): void {
    this.finished = true;
    this.stage = ProjectileStage.Finished;
    body.setVelocity({ x: 0, y: 0 });
  }
}
