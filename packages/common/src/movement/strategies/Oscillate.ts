import * as Matter from 'matter-js';
import { MovementStrategy } from '../MovementStrategy';

/**
 * Implements an oscillating movement pattern
 * 
 * Entity moves back and forth along a single axis or in a pattern
 * like sine wave, useful for patrols or ambient movements
 * 
 * @example
 * ```ts
 * // Horizontal oscillation with amplitude 100 and period 3000ms
 * movementManager.add('entity1', new Oscillate({ x: 1, y: 0 }, 100, 3000));
 * 
 * // Vertical oscillation
 * movementManager.add('entity1', new Oscillate({ x: 0, y: 1 }, 50, 2000));
 * 
 * // Circular oscillation
 * movementManager.add('entity1', new Oscillate({ x: 1, y: 0 }, 100, 4000, 'circular'));
 * ```
 */
export class Oscillate implements MovementStrategy {
  private elapsed: number = 0;
  private startPosition: { x: number, y: number } = { x: 0, y: 0 };
  private positionSet: boolean = false;
  
  /**
   * Create an oscillating movement
   * 
   * @param direction - Primary axis of oscillation (normalized)
   * @param amplitude - Maximum distance from center position
   * @param period - Time in ms for a complete cycle
   * @param type - Oscillation pattern type ('linear', 'sine', 'circular')
   * @param duration - Optional total duration in ms (undefined for infinite)
   */
  constructor(
    private direction: { x: number, y: number },
    private amplitude: number,
    private period: number,
    private type: 'linear' | 'sine' | 'circular' = 'sine',
    private duration?: number
  ) {
    // Normalize direction vector
    const magnitude = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
    if (magnitude !== 0 && magnitude !== 1) {
      this.direction = {
        x: direction.x / magnitude,
        y: direction.y / magnitude
      };
    }
  }
  
  /**
   * Apply oscillating movement
   * 
   * @param body - Matter.js body to move
   * @param dt - Time delta in milliseconds
   */
  update(body: Matter.Body, dt: number): void {
    // Record start position on first update
    if (!this.positionSet) {
      this.startPosition = { ...body.position };
      this.positionSet = true;
    }
    
    this.elapsed += dt;
    
    // Calculate oscillation factor (0 to 1 to 0)
    let factor: number;
    let perpFactor: number = 0;
    
    // Calculate progress through cycle (0 to 1)
    const cycleProgress = (this.elapsed % this.period) / this.period;
    
    switch (this.type) {
      case 'linear':
        // Triangle wave (0->1->0)
        factor = cycleProgress < 0.5 
          ? cycleProgress * 2 
          : (1 - cycleProgress) * 2;
        break;
        
      case 'sine':
        // Sine wave
        factor = Math.sin(cycleProgress * Math.PI * 2) * 0.5 + 0.5;
        break;
        
      case 'circular':
        // Circular motion
        factor = Math.sin(cycleProgress * Math.PI * 2);
        perpFactor = Math.cos(cycleProgress * Math.PI * 2);
        break;
        
      default:
        factor = Math.sin(cycleProgress * Math.PI * 2) * 0.5 + 0.5;
    }
    
    // Calculate new position
    let newX, newY;
    
    if (this.type === 'circular') {
      // For circular, we need both sine and cosine components
      const perpDirection = { x: -this.direction.y, y: this.direction.x };
      
      newX = this.startPosition.x + 
             (this.direction.x * factor * this.amplitude) + 
             (perpDirection.x * perpFactor * this.amplitude);
             
      newY = this.startPosition.y + 
             (this.direction.y * factor * this.amplitude) + 
             (perpDirection.y * perpFactor * this.amplitude);
    } else {
      // Map factor from 0-1 to -1 to 1 range for linear and sine
      const mappedFactor = factor * 2 - 1;
      
      newX = this.startPosition.x + (this.direction.x * mappedFactor * this.amplitude);
      newY = this.startPosition.y + (this.direction.y * mappedFactor * this.amplitude);
    }
    
    // Calculate velocity based on position difference
    const vx = (newX - body.position.x) / (dt / 1000);
    const vy = (newY - body.position.y) / (dt / 1000);
    
    // Apply velocity
    Matter.Body.setVelocity(body, { x: vx, y: vy });
  }
  
  /**
   * Check if oscillation duration has elapsed
   * 
   * @returns True if movement is finished
   */
  isFinished(): boolean {
    return this.duration !== undefined && this.elapsed >= this.duration;
  }
  
  /**
   * Reset the oscillation to start from the current position
   */
  reset(): void {
    this.elapsed = 0;
    this.positionSet = false;
  }
} 