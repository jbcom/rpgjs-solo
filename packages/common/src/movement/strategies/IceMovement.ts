import * as Matter from 'matter-js';
import { MovementStrategy } from '../MovementStrategy';

/**
 * Implements a slippery movement for icy surfaces
 * 
 * Creates a realistic ice-physics effect with:
 * - Slow acceleration when starting to move
 * - Slippery inertia when stopping
 * - Gradual turning with momentum
 * 
 * @example
 * ```ts
 * // Apply ice movement to player on ice terrain
 * movementManager.add('player1', new IceMovement({ x: 1, y: 0 }, 5));
 * 
 * // Update direction when player changes direction
 * iceMovement.setTargetDirection({ x: 0, y: 1 });
 * ```
 */
export class IceMovement implements MovementStrategy {
  // Current velocity components
  private currentVx: number = 0;
  private currentVy: number = 0;
  
  // Flags
  private stopped: boolean = false;
  private elapsed: number = 0;
  
  /**
   * Create an ice movement behavior
   * 
   * @param targetDirection - Desired movement direction (normalized vector)
   * @param maxSpeed - Maximum speed when fully accelerated
   * @param acceleration - Acceleration rate (0-1, lower = more slippery start)
   * @param friction - Friction rate (0-1, lower = more slippery stop)
   * @param duration - Optional duration limit for the movement
   */
  constructor(
    private targetDirection: { x: number, y: number },
    private maxSpeed: number = 4,
    private acceleration: number = 0.15,
    private friction: number = 0.05,
    private duration?: number
  ) {
    // Normalize direction
    this.normalizeDirection();
  }
  
  /**
   * Update the ice movement physics
   * 
   * @param body - Matter.js body to move
   * @param dt - Time delta in milliseconds
   */
  update(body: Matter.Body, dt: number): void {
    // Update elapsed time if duration is set
    if (this.duration !== undefined) {
      this.elapsed += dt;
      if (this.elapsed >= this.duration) {
        this.stopped = true;
      }
    }
    
    // Handle acceleration and friction physics
    if (!this.stopped) {
      // Accelerate gradually toward target speed in target direction
      this.currentVx += (this.targetDirection.x * this.maxSpeed - this.currentVx) * this.acceleration;
      this.currentVy += (this.targetDirection.y * this.maxSpeed - this.currentVy) * this.acceleration;
    } else {
      // Apply friction to gradually slow down
      this.currentVx *= (1 - this.friction);
      this.currentVy *= (1 - this.friction);
    }
    
    // Apply the calculated velocity
    Matter.Body.setVelocity(body, {
      x: this.currentVx,
      y: this.currentVy
    });
  }
  
  /**
   * Check if movement is finished
   * (movement is considered finished when almost stopped)
   * 
   * @returns True if movement is effectively stopped
   */
  isFinished(): boolean {
    const speed = Math.hypot(this.currentVx, this.currentVy);
    
    // Movement is finished when:
    // 1. We're in stopped state AND 
    // 2. Speed is negligible (< 0.05)
    return this.stopped && speed < 0.05;
  }
  
  /**
   * Stop the movement (will start applying friction)
   */
  stop(): void {
    this.stopped = true;
  }
  
  /**
   * Resume movement in the current direction
   */
  resume(): void {
    this.stopped = false;
  }
  
  /**
   * Set a new target direction
   * The actual movement will gradually change toward this direction
   * 
   * @param direction - New target direction
   */
  setTargetDirection(direction: { x: number, y: number }): void {
    this.targetDirection = direction;
    this.normalizeDirection();
    
    // If we were stopped, resume movement
    this.stopped = false;
  }
  
  /**
   * Set movement parameters
   * 
   * @param maxSpeed - New maximum speed
   * @param acceleration - New acceleration rate
   * @param friction - New friction rate
   */
  setParameters(maxSpeed?: number, acceleration?: number, friction?: number): void {
    if (maxSpeed !== undefined) this.maxSpeed = maxSpeed;
    if (acceleration !== undefined) this.acceleration = acceleration;
    if (friction !== undefined) this.friction = friction;
  }
  
  /**
   * Normalize the direction vector
   */
  private normalizeDirection(): void {
    const magnitude = Math.sqrt(
      this.targetDirection.x * this.targetDirection.x + 
      this.targetDirection.y * this.targetDirection.y
    );
    
    if (magnitude > 0) {
      this.targetDirection = {
        x: this.targetDirection.x / magnitude,
        y: this.targetDirection.y / magnitude
      };
    } else {
      // Default to no direction
      this.targetDirection = { x: 0, y: 0 };
    }
  }
} 