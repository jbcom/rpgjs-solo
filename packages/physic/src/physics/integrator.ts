import { Entity } from './Entity';
import { Vector2 } from '../core/math/Vector2';

/**
 * Integration method type
 */
export enum IntegrationMethod {
  /** Semi-implicit Euler (default, stable and fast) */
  Euler = 'euler',
  /** Verlet integration (more stable, better energy conservation) */
  Verlet = 'verlet',
}

/**
 * Configuration for physics integration
 */
export interface IntegratorConfig {
  /** Integration method to use */
  method?: IntegrationMethod;
  /** Time step (usually 1/60 for 60 FPS) */
  deltaTime: number;
  /** Gravity vector (optional, for top-down usually zero) */
  gravity?: Vector2;
}

/**
 * Physics integrator
 * 
 * Handles numerical integration of physical entities.
 * Supports multiple integration methods for different stability requirements.
 * 
 * @example
 * ```typescript
 * const integrator = new Integrator({ deltaTime: 1/60 });
 * integrator.integrate(entity);
 * ```
 */
export class Integrator {
  private config: IntegratorConfig;
  private gravity: Vector2;

  /**
   * Creates a new integrator
   * 
   * @param config - Integrator configuration
   */
  constructor(config: IntegratorConfig) {
    this.config = config;
    this.gravity = config.gravity?.clone() ?? new Vector2(0, 0);
  }

  /**
   * Integrates an entity's motion
   * 
   * Updates position, velocity, and rotation based on forces and torques.
   * 
   * @param entity - Entity to integrate
   */
  public integrate(entity: Entity): void {
    if (entity.isStatic() || entity.isSleeping()) {
      return;
    }

    switch (this.config.method ?? IntegrationMethod.Euler) {
      case IntegrationMethod.Euler:
        this.integrateEuler(entity);
        break;
      case IntegrationMethod.Verlet:
        this.integrateVerlet(entity);
        break;
    }
  }

  /**
   * Semi-implicit Euler integration
   * 
   * Updates velocity first, then position. More stable than explicit Euler.
   * 
   * @param entity - Entity to integrate
   */
  private integrateEuler(entity: Entity): void {
    const dt = this.config.deltaTime;
    const invMass = entity.invMass;

    // Apply gravity if entity has mass
    if (invMass > 0) {
      entity.force.addInPlace(this.gravity.mul(entity.mass));
    }

    // Update linear velocity: v = v + a * dt
    // a = F / m
    const acceleration = entity.force.mul(invMass);
    entity.velocity.addInPlace(acceleration.mul(dt));

    // Apply linear damping
    const linearDampingFactor = 1 - entity.linearDamping;
    entity.velocity.mulInPlace(linearDampingFactor);

    // Clamp velocity
    entity.clampVelocities();

    // Check if movement state changed (after damping/clamping)
    entity.notifyMovementChange();

    // Check if direction changed
    entity.notifyDirectionChange();

    // Update position: x = x + v * dt
    const oldPosition = entity.position.clone();
    entity.position.addInPlace(entity.velocity.mul(dt));

    // Notify position change if position actually changed
    const delta = entity.position.sub(oldPosition);
    if (delta.lengthSquared() > 1e-6) {
      entity.notifyPositionChange();
    }

    // Update angular velocity: ω = ω + α * dt
    // α = τ / I (simplified: I = m * r²)
    const momentOfInertia = entity.mass * entity.radius * entity.radius;
    if (momentOfInertia > 0) {
      const angularAcceleration = entity.torque / momentOfInertia;
      entity.angularVelocity += angularAcceleration * dt;
    }

    // Apply angular damping
    const angularDampingFactor = 1 - entity.angularDamping;
    entity.angularVelocity *= angularDampingFactor;

    // Clamp angular velocity
    if (Math.abs(entity.angularVelocity) > entity.maxAngularVelocity) {
      entity.angularVelocity = Math.sign(entity.angularVelocity) * entity.maxAngularVelocity;
    }

    // Update rotation: θ = θ + ω * dt
    entity.rotation += entity.angularVelocity * dt;

    // Normalize rotation to [-π, π]
    while (entity.rotation > Math.PI) {
      entity.rotation -= 2 * Math.PI;
    }
    while (entity.rotation < -Math.PI) {
      entity.rotation += 2 * Math.PI;
    }

    // Clear forces for next frame
    entity.clearForces();
  }

  /**
   * Verlet integration
   * 
   * More stable than Euler, better energy conservation.
   * Requires storing previous position.
   * 
   * @param entity - Entity to integrate
   */
  private integrateVerlet(entity: Entity): void {
    const dt = this.config.deltaTime;
    const dt2 = dt * dt;
    const invMass = entity.invMass;

    // Apply gravity
    if (invMass > 0) {
      entity.force.addInPlace(this.gravity.mul(entity.mass));
    }

    // Calculate acceleration
    const acceleration = entity.force.mul(invMass);

    // Verlet: x(t+dt) = 2*x(t) - x(t-dt) + a*dt²
    // For first step, we need previous position (stored in a temporary property)
    // Since we don't store previous position, we use velocity-based approximation:
    // x(t+dt) = x(t) + v(t)*dt + 0.5*a*dt²
    const newPosition = entity.position
      .add(entity.velocity.mul(dt))
      .add(acceleration.mul(0.5 * dt2));

    // Update velocity: v(t+dt) = (x(t+dt) - x(t)) / dt
    const newVelocity = newPosition.sub(entity.position).div(dt);

    // Apply damping
    const linearDampingFactor = 1 - entity.linearDamping;
    newVelocity.mulInPlace(linearDampingFactor);

    // Update entity
    const oldPosition = entity.position.clone();
    entity.position = newPosition;
    entity.velocity = newVelocity;

    // Clamp velocity
    entity.clampVelocities();

    // Check if movement state changed (after damping/clamping)
    entity.notifyMovementChange();

    // Check if direction changed
    entity.notifyDirectionChange();

    // Notify position change if position actually changed
    const delta = entity.position.sub(oldPosition);
    if (delta.lengthSquared() > 1e-6) {
      entity.notifyPositionChange();
    }

    // Angular motion (simplified, using Euler for angular)
    const momentOfInertia = entity.mass * entity.radius * entity.radius;
    if (momentOfInertia > 0) {
      const angularAcceleration = entity.torque / momentOfInertia;
      entity.angularVelocity += angularAcceleration * dt;
    }

    const angularDampingFactor = 1 - entity.angularDamping;
    entity.angularVelocity *= angularDampingFactor;

    if (Math.abs(entity.angularVelocity) > entity.maxAngularVelocity) {
      entity.angularVelocity = Math.sign(entity.angularVelocity) * entity.maxAngularVelocity;
    }

    entity.rotation += entity.angularVelocity * dt;

    // Normalize rotation
    while (entity.rotation > Math.PI) {
      entity.rotation -= 2 * Math.PI;
    }
    while (entity.rotation < -Math.PI) {
      entity.rotation += 2 * Math.PI;
    }

    // Clear forces
    entity.clearForces();
  }

  /**
   * Updates the gravity vector
   * 
   * @param gravity - New gravity vector
   */
  public setGravity(gravity: Vector2): void {
    this.gravity.copyFrom(gravity);
  }

  /**
   * Gets the current gravity vector
   * 
   * @returns Gravity vector
   */
  public getGravity(): Vector2 {
    return this.gravity.clone();
  }
}

