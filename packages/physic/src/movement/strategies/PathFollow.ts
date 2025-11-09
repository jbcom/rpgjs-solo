import { MovementBody, MovementStrategy } from '../MovementStrategy';

/**
 * Makes an entity follow a list of waypoints at a constant speed.
 *
 * @example
 * ```typescript
 * movementManager.add(npc, new PathFollow(
 *   [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }],
 *   1.5,
 *   true,
 *   0.5,
 * ));
 * ```
 */
export class PathFollow implements MovementStrategy {
  private currentWaypoint = 0;
  private elapsedPause = 0;
  private paused = false;
  private finished = false;
  private direction: { x: number; y: number } = { x: 0, y: 0 };

  /**
   * Creates a path-following strategy.
   *
   * @param waypoints - List of waypoints to traverse
   * @param speed - Travel speed in units per second
   * @param loop - When true, restart from the first waypoint
   * @param pauseAtWaypoints - Optional pause duration (seconds) at each waypoint
   * @param tolerance - Distance tolerance to consider a waypoint reached
   */
  constructor(
    private waypoints: Array<{ x: number; y: number }>,
    private readonly speed: number,
    private readonly loop = false,
    private readonly pauseAtWaypoints = 0,
    private readonly tolerance = 0.1,
  ) {
    if (waypoints.length === 0) {
      this.finished = true;
    }
  }

  update(body: MovementBody, dt: number): void {
    if (this.finished || this.waypoints.length === 0) {
      body.setVelocity({ x: 0, y: 0 });
      return;
    }

    if (this.paused) {
      this.elapsedPause += dt;
      body.setVelocity({ x: 0, y: 0 });

      if (this.elapsedPause >= this.pauseAtWaypoints) {
        this.paused = false;
        this.elapsedPause = 0;
      } else {
        return;
      }
    }

    const target = this.waypoints[this.currentWaypoint];
    if (!target) {
      this.finished = true;
      body.setVelocity({ x: 0, y: 0 });
      return;
    }
    const dx = target.x - body.position.x;
    const dy = target.y - body.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= this.tolerance) {
      this.currentWaypoint += 1;

      if (this.currentWaypoint >= this.waypoints.length) {
        if (this.loop) {
          this.currentWaypoint = 0;
        } else {
          this.finished = true;
          body.setVelocity({ x: 0, y: 0 });
          return;
        }
      }

      if (this.pauseAtWaypoints > 0) {
        this.paused = true;
        this.elapsedPause = 0;
        body.setVelocity({ x: 0, y: 0 });
        return;
      }
    }

    if (distance > 0) {
      this.direction = { x: dx / distance, y: dy / distance };
    }

    body.setVelocity({
      x: this.direction.x * this.speed,
      y: this.direction.y * this.speed,
    });
  }

  isFinished(): boolean {
    return this.finished;
  }

  getCurrentWaypoint(): number {
    return this.currentWaypoint;
  }

  setWaypoints(waypoints: Array<{ x: number; y: number }>, reset = true): void {
    this.waypoints = waypoints;
    this.finished = waypoints.length === 0;
    if (reset) {
      this.currentWaypoint = 0;
      this.paused = false;
      this.elapsedPause = 0;
    }
  }
}

