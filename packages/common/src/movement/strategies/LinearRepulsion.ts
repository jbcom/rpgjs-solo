import * as Matter from 'matter-js';
import { RpgCommonPhysic } from '../../Physic';
import { MovementStrategy } from '../MovementStrategy';

/** Utilitaires Vec2 pour éviter des new() à chaque frame */
const vTmp1 = Matter.Vector.create();
const vTmp2 = Matter.Vector.create();

/**
 * Implements a seek behavior with linear obstacle avoidance
 * 
 * Similar to SeekAvoid but uses a linear repulsion model instead of inverse square.
 * This creates a smoother avoidance field with gradual transitions.
 * 
 * @example
 * ```ts
 * // Make enemy follow player with smooth avoidance
 * const playerPosition = () => Matter.Vector.create(player.x(), player.y());
 * movementManager.add('enemy1', new LinearRepulsion(physics, playerPosition, 3, 50, 5));
 * ```
 */
export class LinearRepulsion implements MovementStrategy {
  private repulseRadius2: number;
  
  /**
   * Create a seeking movement with linear obstacle avoidance
   * 
   * @param phys - Physics system to query for nearby obstacles
   * @param target - Function returning the current target position
   * @param maxSpeed - Maximum movement speed
   * @param repulseRadius - Radius around entity to check for obstacles
   * @param repulseWeight - Strength of repulsion from obstacles
   */
  constructor(
    private phys: RpgCommonPhysic,
    private target: () => Matter.Vector,
    private maxSpeed = 2.5,
    private repulseRadius = 32,
    private repulseWeight = 4
  ) {
    this.repulseRadius2 = this.repulseRadius * this.repulseRadius;
  }

  /**
   * Update seek and avoid behavior with linear repulsion
   * 
   * @param body - Matter.js body to move
   * @param dt - Time delta in milliseconds
   */
  update(body: Matter.Body, dt: number): void {
    // 1) Attraction (pull) vers la cible actuelle
    Matter.Vector.sub(this.target(), body.position, vTmp1);
    const distance = Matter.Vector.magnitude(vTmp1);
    if (distance > 0.0001) Matter.Vector.mult(vTmp1, 1 / distance, vTmp1);

    // 2) Répulsion linéaire - force plus douce qui diminue graduellement
    const area = {
      min: { x: body.position.x - this.repulseRadius,
             y: body.position.y - this.repulseRadius },
      max: { x: body.position.x + this.repulseRadius,
             y: body.position.y + this.repulseRadius }
    };
    const nearby = Matter.Query.region(this.phys.getWorld().bodies, area);

    let pushX = 0, pushY = 0;
    for (const b of nearby) {
      if (b === body || b.isSensor) continue;
      
      Matter.Vector.sub(body.position, b.position, vTmp2);
      const d2 = Matter.Vector.magnitudeSquared(vTmp2);
      
      if (d2 > this.repulseRadius2) continue;  // trop loin, pas de répulsion
      
      // Répulsion linéaire: force maximale au centre, nulle au bord
      const d = Math.sqrt(d2);
      const w = this.repulseWeight * (this.repulseRadius - d) / this.repulseRadius;
      
      // Normalisation du vecteur de répulsion
      if (d > 0.0001) {
        pushX += vTmp2.x * w / d;
        pushY += vTmp2.y * w / d;
      }
    }

    // Limiter la norme du push cumulé
    const MAX_PUSH_LEN = this.maxSpeed * 3;
    let pushLen = Math.hypot(pushX, pushY);
    if (pushLen > MAX_PUSH_LEN) {
      pushX = pushX * MAX_PUSH_LEN / pushLen;
      pushY = pushY * MAX_PUSH_LEN / pushLen;
    }

    // 3) Vitesse désirée = pull + push, puis clamp à maxSpeed
    const desired = Matter.Vector.create(
      vTmp1.x * this.maxSpeed + pushX,
      vTmp1.y * this.maxSpeed + pushY
    );
    const len = Matter.Vector.magnitude(desired);
    if (len > this.maxSpeed) Matter.Vector.mult(desired, this.maxSpeed / len, desired);
  
    Matter.Body.setVelocity(body, desired);
  }
  
  /**
   * Update the target to follow
   * 
   * @param newTarget - Function returning the new target position
   */
  setTarget(newTarget: () => Matter.Vector): void {
    this.target = newTarget;
  }
  
  /**
   * Update movement parameters
   * 
   * @param maxSpeed - New maximum speed
   * @param repulseRadius - New repulsion radius
   * @param repulseWeight - New repulsion weight
   */
  setParameters(maxSpeed?: number, repulseRadius?: number, repulseWeight?: number): void {
    if (maxSpeed !== undefined) this.maxSpeed = maxSpeed;
    if (repulseRadius !== undefined) {
      this.repulseRadius = repulseRadius;
      this.repulseRadius2 = this.repulseRadius * this.repulseRadius;
    }
    if (repulseWeight !== undefined) this.repulseWeight = repulseWeight;
  }
} 