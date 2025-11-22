import { describe, it, expect } from 'vitest';
import { Entity } from './Entity';
import { Vector2 } from '../core/math/Vector2';
import { EntityState } from '../core/types';

describe('Entity', () => {
  it('should create an entity with default values', () => {
    const entity = new Entity();
    expect(entity.position.x).toBe(0);
    expect(entity.position.y).toBe(0);
    expect(entity.mass).toBe(1);
  });

  it('should create an entity with configuration', () => {
    const entity = new Entity({
      position: { x: 10, y: 20 },
      mass: 2,
      radius: 5,
    });
    expect(entity.position.x).toBe(10);
    expect(entity.position.y).toBe(20);
    expect(entity.mass).toBe(2);
    expect(entity.radius).toBe(5);
  });

  it('should apply force', () => {
    const entity = new Entity({ mass: 1 });
    entity.applyForce(new Vector2(10, 0));
    expect(entity.force.x).toBe(10);
    expect(entity.force.y).toBe(0);
  });

  it('should apply impulse', () => {
    const entity = new Entity({ mass: 1 });
    entity.applyImpulse(new Vector2(5, 0));
    expect(entity.velocity.x).toBe(5);
    expect(entity.velocity.y).toBe(0);
  });

  it('should teleport entity', () => {
    const entity = new Entity();
    entity.teleport(new Vector2(100, 200));
    expect(entity.position.x).toBe(100);
    expect(entity.position.y).toBe(200);
  });

  it('should freeze entity', () => {
    const entity = new Entity();
    entity.freeze();
    expect(entity.isStatic()).toBe(true);
    expect(entity.velocity.x).toBe(0);
    expect(entity.velocity.y).toBe(0);
  });

  it('should check collision masks', () => {
    const entity1 = new Entity({ collisionCategory: 0x01, collisionMask: 0x02 });
    const entity2 = new Entity({ collisionCategory: 0x02, collisionMask: 0x01 });
    expect(entity1.canCollideWith(entity2)).toBe(true);
  });

  it('should treat mass = 0 as static', () => {
    const entity = new Entity({ mass: 0 });
    expect(entity.mass).toBe(0);
    expect(entity.invMass).toBe(0);
    expect(entity.isStatic()).toBe(true);
  });

  it('should treat mass = Infinity as static', () => {
    const entity = new Entity({ mass: Infinity });
    expect(entity.mass).toBe(Infinity);
    expect(entity.invMass).toBe(0);
    expect(entity.isStatic()).toBe(true);
  });

  it('should not apply force to static entity with mass = Infinity', () => {
    const entity = new Entity({ mass: Infinity });
    entity.applyForce(new Vector2(100, 0));
    expect(entity.force.x).toBe(0);
    expect(entity.force.y).toBe(0);
  });

  it('should not apply impulse to static entity with mass = Infinity', () => {
    const entity = new Entity({ mass: Infinity });
    entity.applyImpulse(new Vector2(100, 0));
    expect(entity.velocity.x).toBe(0);
    expect(entity.velocity.y).toBe(0);
  });

  it('should treat dynamic entity with mass > 0 as non-static', () => {
    const entity = new Entity({ mass: 1 });
    expect(entity.mass).toBe(1);
    expect(entity.invMass).toBe(1);
    expect(entity.isStatic()).toBe(false);
    expect(entity.isDynamic()).toBe(true);
  });

  describe('onMovementChange', () => {
    it('should fire movement change event with intensity when entity starts moving', () => {
      const entity = new Entity({ mass: 1 });
      let eventData: any = null;

      entity.onMovementChange((event) => {
        eventData = event;
      });

      // Set velocity to trigger movement
      entity.setVelocity(new Vector2(50, 0));

      expect(eventData).not.toBeNull();
      expect(eventData.isMoving).toBe(true);
      expect(eventData.intensity).toBeCloseTo(50, 1);
      expect(eventData.entity).toBe(entity);
    });

    it('should fire movement change event with zero intensity when entity stops', () => {
      const entity = new Entity({ mass: 1 });
      let eventData: any = null;

      entity.onMovementChange((event) => {
        eventData = event;
      });

      // Start moving
      entity.setVelocity(new Vector2(50, 0));
      eventData = null; // Reset

      // Stop moving
      entity.setVelocity(new Vector2(0, 0));

      expect(eventData).not.toBeNull();
      expect(eventData.isMoving).toBe(false);
      expect(eventData.intensity).toBeCloseTo(0, 1);
    });

    it('should calculate intensity correctly for diagonal movement', () => {
      const entity = new Entity({ mass: 1 });
      let eventData: any = null;

      entity.onMovementChange((event) => {
        eventData = event;
      });

      // Set diagonal velocity (3, 4) -> magnitude = 5
      entity.setVelocity(new Vector2(3, 4));

      expect(eventData).not.toBeNull();
      expect(eventData.isMoving).toBe(true);
      expect(eventData.intensity).toBeCloseTo(5, 1);
    });

    it('should provide intensity for different speed levels', () => {
      const entity = new Entity({ mass: 1 });
      const intensities: number[] = [];

      entity.onMovementChange((event) => {
        intensities.push(event.intensity);
      });

      // Slow movement (idle -> moving)
      entity.setVelocity(new Vector2(10, 0));
      expect(intensities[intensities.length - 1]).toBeCloseTo(10, 1);

      // Stop to trigger state change
      entity.setVelocity(new Vector2(0, 0));
      
      // Medium movement (idle -> moving)
      entity.setVelocity(new Vector2(50, 0));
      expect(intensities[intensities.length - 1]).toBeCloseTo(50, 1);

      // Stop to trigger state change
      entity.setVelocity(new Vector2(0, 0));
      
      // Fast movement (idle -> moving)
      entity.setVelocity(new Vector2(200, 0));
      expect(intensities[intensities.length - 1]).toBeCloseTo(200, 1);
    });

    it('should only fire event when movement state actually changes', () => {
      const entity = new Entity({ mass: 1 });
      let callCount = 0;

      entity.onMovementChange(() => {
        callCount++;
      });

      // First change: idle -> moving
      entity.setVelocity(new Vector2(50, 0));
      expect(callCount).toBe(1);

      // Second change: moving -> moving (different velocity, same state)
      entity.setVelocity(new Vector2(100, 0));
      expect(callCount).toBe(1); // Should not fire again

      // Third change: moving -> idle
      entity.setVelocity(new Vector2(0, 0));
      expect(callCount).toBe(2);
    });
  });
});

