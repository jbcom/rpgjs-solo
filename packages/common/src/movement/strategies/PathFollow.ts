import * as Matter from 'matter-js';
import { MovementStrategy } from '../MovementStrategy';

/**
 * Implements a path following movement that navigates through waypoints
 * 
 * The entity will follow a sequence of waypoints at a specified speed,
 * with optional looping behavior.
 * 
 * @example
 * ```ts
 * // Create a patrol path for an NPC
 * const waypoints = [
 *   { x: 100, y: 100 },
 *   { x: 300, y: 100 },
 *   { x: 300, y: 300 },
 *   { x: 100, y: 300 }
 * ];
 * 
 * // Follow path once
 * movementManager.add('npc1', new PathFollow(waypoints, 3));
 * 
 * // Loop indefinitely (patrol)
 * movementManager.add('npc1', new PathFollow(waypoints, 3, true));
 * ```
 */
export class PathFollow implements MovementStrategy {
  private currentWaypoint: number = 0;
  private finished: boolean = false;
  private direction: { x: number, y: number } = { x: 0, y: 0 };
  private waypointThreshold: number = 5; // Distance threshold to consider waypoint reached
  
  /**
   * Create a path following movement
   * 
   * @param waypoints - Array of x,y positions to follow
   * @param speed - Movement speed in pixels per frame
   * @param loop - Whether to loop back to start after reaching final waypoint
   * @param pauseAtWaypoints - Optional time in ms to pause at each waypoint
   */
  constructor(
    private waypoints: Array<{ x: number, y: number }>,
    private speed: number,
    private loop: boolean = false,
    private pauseAtWaypoints: number = 0
  ) {
    if (waypoints.length === 0) {
      this.finished = true;
    }
  }
  
  private pauseTimer: number = 0;
  private isPaused: boolean = false;
  
  /**
   * Update path following logic
   * 
   * @param body - Matter.js body to move
   * @param dt - Time delta in milliseconds
   */
  update(body: Matter.Body, dt: number): void {
    if (this.finished || this.waypoints.length === 0) {
      Matter.Body.setVelocity(body, { x: 0, y: 0 });
      return;
    }
    
    // Handle pausing at waypoints
    if (this.isPaused) {
      Matter.Body.setVelocity(body, { x: 0, y: 0 });
      this.pauseTimer += dt;
      
      if (this.pauseTimer >= this.pauseAtWaypoints) {
        this.isPaused = false;
        this.pauseTimer = 0;
      }
      return;
    }
    
    const currentTarget = this.waypoints[this.currentWaypoint];
    const distanceX = currentTarget.x - body.position.x;
    const distanceY = currentTarget.y - body.position.y;
    const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
    
    // Check if waypoint is reached
    if (distance <= this.waypointThreshold) {
      // Go to next waypoint
      this.currentWaypoint++;
      
      // Check if we've finished the path
      if (this.currentWaypoint >= this.waypoints.length) {
        if (this.loop) {
          // Loop back to beginning
          this.currentWaypoint = 0;
        } else {
          // End path following
          this.finished = true;
          Matter.Body.setVelocity(body, { x: 0, y: 0 });
          return;
        }
      }
      
      // Pause at waypoint if specified
      if (this.pauseAtWaypoints > 0) {
        this.isPaused = true;
        this.pauseTimer = 0;
        return;
      }
    }
    
    // Calculate movement direction toward current waypoint
    if (distance > 0) {
      this.direction = {
        x: distanceX / distance,
        y: distanceY / distance
      };
    }
    
    // Apply velocity toward current waypoint
    Matter.Body.setVelocity(body, {
      x: this.direction.x * this.speed,
      y: this.direction.y * this.speed
    });
  }
  
  /**
   * Check if path has been fully traversed
   * 
   * @returns True if path following is complete
   */
  isFinished(): boolean {
    return this.finished;
  }
  
  /**
   * Get current waypoint index
   * 
   * @returns The index of the current target waypoint
   */
  getCurrentWaypoint(): number {
    return this.currentWaypoint;
  }
  
  /**
   * Set a new path of waypoints
   * 
   * @param waypoints - New waypoints to follow
   * @param resetProgress - Whether to start from the first waypoint
   */
  setWaypoints(waypoints: Array<{ x: number, y: number }>, resetProgress: boolean = true): void {
    this.waypoints = waypoints;
    if (resetProgress) {
      this.currentWaypoint = 0;
    }
    this.finished = waypoints.length === 0;
  }
} 