import * as Matter from 'matter-js';
import { MovementStrategy } from '../MovementStrategy';

/**
 * Type of projectile trajectory
 */
export enum ProjectileType {
  /** Straight line movement (arrows, bullets) */
  Straight = 'straight',
  
  /** Parabolic arc (grenades, bombs) */
  Arc = 'arc',
  
  /** Bouncing projectile (bouncing bombs, coins) */
  Bounce = 'bounce'
}

/**
 * Lifecycle stage of projectile
 */
enum ProjectileStage {
  Flying,
  Bouncing,
  Finished
}

/**
 * Projectile configuration options
 */
export interface ProjectileOptions {
  /** Initial velocity in pixels per second */
  speed: number;
  
  /** Direction vector (will be normalized) */
  direction: { x: number, y: number };
  
  /** Maximum range in pixels before projectile disappears */
  maxRange?: number;
  
  /** Maximum lifetime in milliseconds */
  lifetime?: number;
  
  /** Initial height (Z coordinate) */
  initialHeight?: number;
  
  /** Maximum height of arc trajectory */
  maxHeight?: number;
  
  /** Gravity strength (pixels/second²) */
  gravity?: number;
  
  /** Number of bounces allowed (for bouncing projectiles) */
  maxBounces?: number;
  
  /** Energy retained after each bounce (0-1) */
  bounciness?: number;
  
  /** Air resistance/drag (0-1) */
  drag?: number;
}

/**
 * Implements projectile movement with various trajectory types
 * 
 * Supports:
 * - Straight movement (arrows, bullets)
 * - Parabolic arcs (thrown objects, grenades)
 * - Bouncing projectiles (coins, bouncing bombs)
 * 
 * The z-coordinate represents height above ground for 3D effects
 * 
 * @example
 * ```ts
 * // Create an arrow (straight projectile)
 * const arrow = new ProjectileMovement(ProjectileType.Straight, {
 *   speed: 300,
 *   direction: { x: 1, y: 0 },
 *   maxRange: 500
 * });
 * 
 * // Create a thrown bomb (arc projectile)
 * const bomb = new ProjectileMovement(ProjectileType.Arc, {
 *   speed: 150,
 *   direction: { x: 0.7, y: 0.7 },
 *   maxHeight: 100,
 *   gravity: 400
 * });
 * 
 * // Create bouncing coins (random directions with bounce)
 * function spawnCoin(x, y) {
 *   const randomAngle = Math.random() * Math.PI * 2;
 *   const coin = new ProjectileMovement(ProjectileType.Bounce, {
 *     speed: 80 + Math.random() * 40,
 *     direction: { 
 *       x: Math.cos(randomAngle), 
 *       y: Math.sin(randomAngle) 
 *     },
 *     initialHeight: 0,
 *     maxHeight: 20 + Math.random() * 30,
 *     gravity: 500,
 *     maxBounces: 2,
 *     bounciness: 0.6
 *   });
 *   
 *   // Create coin entity and add to the world
 *   // movementManager.add(coinId, coin);
 * }
 * ```
 */
export class ProjectileMovement implements MovementStrategy {
  private elapsed: number = 0;
  private distanceTraveled: number = 0;
  private startPosition: Matter.Vector = { x: 0, y: 0 };
  private bounceCount: number = 0;
  private stage: ProjectileStage = ProjectileStage.Flying;
  private finished: boolean = false;
  
  // Trajectory calculation variables
  private currentHeight: number = 0;
  private verticalVelocity: number = 0;
  private normalizedDirection: { x: number, y: number };
  
  // Default options
  private readonly defaultOptions: Partial<ProjectileOptions> = {
    initialHeight: 0,
    maxHeight: 50,
    gravity: 500,
    maxBounces: 0,
    bounciness: 0.6,
    drag: 0.01
  };
  
  /**
   * Create a projectile movement
   * 
   * @param type - Type of projectile trajectory
   * @param options - Projectile configuration
   */
  constructor(
    private type: ProjectileType,
    private options: ProjectileOptions
  ) {
    // Apply default options if not specified
    this.options = { ...this.defaultOptions, ...options };
    
    // Normalize direction
    const dirMagnitude = Math.sqrt(
      options.direction.x * options.direction.x + 
      options.direction.y * options.direction.y
    );
    
    this.normalizedDirection = dirMagnitude > 0 
      ? { 
          x: options.direction.x / dirMagnitude, 
          y: options.direction.y / dirMagnitude 
        }
      : { x: 1, y: 0 };
    
    // Setup initial height and vertical velocity based on type
    this.currentHeight = options.initialHeight || 0;
    
    if (type === ProjectileType.Arc || type === ProjectileType.Bounce) {
      // Calculate initial vertical velocity based on desired arc height
      const maxHeight = options.maxHeight || 50;
      const gravity = options.gravity || 500;
      
      // Physics: v₀ = √(2gh) where g is gravity and h is desired height
      this.verticalVelocity = Math.sqrt(2 * gravity * maxHeight);
    }
  }
  
  /**
   * Update projectile movement
   * 
   * @param body - Matter.js body to move
   * @param dt - Time delta in milliseconds
   */
  update(body: Matter.Body, dt: number): void {
    // On first update, store start position
    if (this.elapsed === 0) {
      this.startPosition = { ...body.position };
    }
    
    // Update elapsed time
    this.elapsed += dt;
    const dtSeconds = dt / 1000; // Convert to seconds for physics calculations
    
    // Check if projectile has reached maximum lifetime
    if (this.options.lifetime !== undefined && this.elapsed >= this.options.lifetime) {
      this.finished = true;
      Matter.Body.setVelocity(body, { x: 0, y: 0 });
      return;
    }
    
    // Handle different trajectory types
    if (this.stage === ProjectileStage.Flying) {
      this.updateFlying(body, dtSeconds);
    } else if (this.stage === ProjectileStage.Bouncing) {
      this.updateBouncing(body, dtSeconds);
    }
    
    // Update total distance traveled
    const dx = body.position.x - this.startPosition.x;
    const dy = body.position.y - this.startPosition.y;
    this.distanceTraveled = Math.sqrt(dx * dx + dy * dy);
    
    // Check if projectile has reached maximum range
    if (this.options.maxRange !== undefined && this.distanceTraveled >= this.options.maxRange) {
      this.finished = true;
      Matter.Body.setVelocity(body, { x: 0, y: 0 });
    }
  }
  
  /**
   * Update projectile while in flying stage
   */
  private updateFlying(body: Matter.Body, dtSeconds: number): void {
    // Base horizontal velocity 
    let vx = this.normalizedDirection.x * this.options.speed;
    let vy = this.normalizedDirection.y * this.options.speed;
    
    // Apply drag if specified
    if (this.options.drag && this.options.drag > 0) {
      vx *= (1 - this.options.drag * dtSeconds);
      vy *= (1 - this.options.drag * dtSeconds);
    }
    
    // For arc and bounce trajectories, update height and check for landing
    if (this.type === ProjectileType.Arc || this.type === ProjectileType.Bounce) {
      // Apply gravity to vertical velocity
      this.verticalVelocity -= (this.options.gravity || 500) * dtSeconds;
      
      // Update height
      this.currentHeight += this.verticalVelocity * dtSeconds;
      
      // Check if projectile has hit the ground
      if (this.currentHeight <= 0) {
        this.currentHeight = 0;
        
        if (this.type === ProjectileType.Bounce) {
          // Handle bouncing
          if (this.bounceCount < (this.options.maxBounces || 0)) {
            // Bounce with reduced energy
            this.verticalVelocity = -this.verticalVelocity * (this.options.bounciness || 0.6);
            this.bounceCount++;
            
            // Also reduce horizontal velocity slightly with each bounce
            vx *= (this.options.bounciness || 0.6);
            vy *= (this.options.bounciness || 0.6);
          } else {
            // No more bounces, enter bouncing stage (rolling/sliding)
            this.stage = ProjectileStage.Bouncing;
          }
        } else {
          // Arc projectile that hit ground - finished
          this.finished = true;
          Matter.Body.setVelocity(body, { x: 0, y: 0 });
          return;
        }
      }
    }
    
    // Apply the calculated velocity
    Matter.Body.setVelocity(body, { x: vx, y: vy });
    
    // Emit a custom event to render the height
    const renderHeightEvent = new CustomEvent('projectile:height', { 
      detail: {
        id: body.id,
        height: this.currentHeight
      }
    });
    window.dispatchEvent(renderHeightEvent);
  }
  
  /**
   * Update projectile while in bouncing stage (rolling/sliding)
   */
  private updateBouncing(body: Matter.Body, dtSeconds: number): void {
    // Simple friction-based slowing down
    const friction = 0.95; // More friction when rolling
    
    let vx = body.velocity.x * friction;
    let vy = body.velocity.y * friction;
    
    // Apply the calculated velocity
    Matter.Body.setVelocity(body, { x: vx, y: vy });
    
    // Check if nearly stopped - mark as finished
    if (Math.abs(vx) < 0.5 && Math.abs(vy) < 0.5) {
      this.finished = true;
      Matter.Body.setVelocity(body, { x: 0, y: 0 });
    }
  }
  
  /**
   * Check if projectile has completed its trajectory
   */
  isFinished(): boolean {
    return this.finished;
  }
  
  /**
   * Get current height of projectile above ground
   */
  getHeight(): number {
    return this.currentHeight;
  }
  
  /**
   * Get position along trajectory (0 to 1)
   * Useful for animation progress
   */
  getProgress(): number {
    if (this.options.maxRange) {
      return Math.min(1, this.distanceTraveled / this.options.maxRange);
    } else if (this.options.lifetime) {
      return Math.min(1, this.elapsed / this.options.lifetime);
    }
    return 0;
  }
} 