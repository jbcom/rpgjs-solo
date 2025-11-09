import { Vector2 } from '../../core/math/Vector2';
import { Entity } from '../../physics/Entity';
import { MovementBody } from '../MovementStrategy';

/**
 * Wraps a physics entity to expose the generic `MovementBody` interface.
 */
export class EntityMovementBody implements MovementBody {
  constructor(private readonly entity: Entity) {}

  get id(): string {
    return this.entity.uuid;
  }

  get position(): { x: number; y: number } {
    return this.entity.position;
  }

  get velocity(): { x: number; y: number } {
    return this.entity.velocity;
  }

  setVelocity(velocity: { x: number; y: number }): void {
    this.entity.setVelocity(velocity);
  }

  translate(delta: { x: number; y: number }): void {
    this.entity.position.addInPlace(new Vector2(delta.x, delta.y));
  }

  isStatic(): boolean {
    return this.entity.isStatic();
  }

  /**
   * Returns the underlying entity reference.
   */
  getEntity(): Entity {
    return this.entity;
  }
}

