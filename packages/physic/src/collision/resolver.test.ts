import { describe, it, expect } from 'vitest';
import { CollisionResolver } from './resolver';
import { Entity } from '../physics/Entity';
import { CircleCollider } from './CircleCollider';
import { CollisionInfo } from './Collider';

describe('CollisionResolver', () => {
  it('should resolve collision', () => {
    const resolver = new CollisionResolver();
    const entity1 = new Entity({
      position: { x: 0, y: 0 },
      radius: 5,
      mass: 1,
      velocity: { x: 1, y: 0 },
    });
    const entity2 = new Entity({
      position: { x: 8, y: 0 },
      radius: 5,
      mass: 1,
      velocity: { x: -1, y: 0 },
    });

    const collider1 = new CircleCollider(entity1);
    const collider2 = new CircleCollider(entity2);
    const collision = collider1.testCollision(collider2);

    if (collision) {
      const initialVelocity1 = entity1.velocity.x;
      resolver.resolve(collision);
      // Velocity should change after resolution
      expect(Math.abs(entity1.velocity.x)).toBeLessThan(Math.abs(initialVelocity1));
    }
  });

  it('should separate entities', () => {
    const resolver = new CollisionResolver();
    const entity1 = new Entity({
      position: { x: 0, y: 0 },
      radius: 5,
      mass: 1,
    });
    const entity2 = new Entity({
      position: { x: 8, y: 0 },
      radius: 5,
      mass: 1,
    });

    const collider1 = new CircleCollider(entity1);
    const collider2 = new CircleCollider(entity2);
    const collision = collider1.testCollision(collider2);

    if (collision) {
      const initialDistance = entity1.position.distanceTo(entity2.position);
      resolver.resolve(collision);
      const newDistance = entity1.position.distanceTo(entity2.position);
      expect(newDistance).toBeGreaterThanOrEqual(initialDistance);
    }
  });

  it('should not move static obstacle with mass = Infinity when hit by dynamic entity', () => {
    const resolver = new CollisionResolver();
    
    // Dynamic entity (player)
    const player = new Entity({
      position: { x: 0, y: 0 },
      radius: 5,
      mass: 1,
      velocity: { x: 10, y: 0 },
    });
    
    // Static obstacle (wall)
    const wall = new Entity({
      position: { x: 8, y: 0 },
      radius: 5,
      mass: Infinity,
    });

    const initialWallPosition = wall.position.clone();
    const collider1 = new CircleCollider(player);
    const collider2 = new CircleCollider(wall);
    const collision = collider1.testCollision(collider2);

    if (collision) {
      resolver.resolve(collision);
      
      // Wall should not move at all
      expect(wall.position.x).toBe(initialWallPosition.x);
      expect(wall.position.y).toBe(initialWallPosition.y);
      
      // Player should be pushed back
      expect(player.position.x).toBeLessThan(initialWallPosition.x);
      
      // Wall velocity should remain zero
      expect(wall.velocity.x).toBe(0);
      expect(wall.velocity.y).toBe(0);
      
      // Player velocity should be affected
      expect(Math.abs(player.velocity.x)).toBeLessThan(10);
    }
  });

  it('should not move static obstacle with mass = 0 when hit by dynamic entity', () => {
    const resolver = new CollisionResolver();
    
    // Dynamic entity (player)
    const player = new Entity({
      position: { x: 0, y: 0 },
      radius: 5,
      mass: 1,
      velocity: { x: 10, y: 0 },
    });
    
    // Static obstacle (wall) with mass = 0
    const wall = new Entity({
      position: { x: 8, y: 0 },
      radius: 5,
      mass: 0,
    });

    const initialWallPosition = wall.position.clone();
    const collider1 = new CircleCollider(player);
    const collider2 = new CircleCollider(wall);
    const collision = collider1.testCollision(collider2);

    if (collision) {
      resolver.resolve(collision);
      
      // Wall should not move at all
      expect(wall.position.x).toBe(initialWallPosition.x);
      expect(wall.position.y).toBe(initialWallPosition.y);
      
      // Player should be pushed back
      expect(player.position.x).toBeLessThan(initialWallPosition.x);
      
      // Wall velocity should remain zero
      expect(wall.velocity.x).toBe(0);
      expect(wall.velocity.y).toBe(0);
    }
  });

  it('respects canBePushedBy without making the entity static', () => {
    const resolver = new CollisionResolver();
    const player = new Entity({
      position: { x: 0, y: 0 },
      radius: 5,
      mass: 1,
      velocity: { x: 10, y: 0 },
    });
    const event = new Entity({
      position: { x: 8, y: 0 },
      radius: 5,
      mass: 20,
    });
    event.canBePushedBy = () => false;

    const initialEventPosition = event.position.clone();
    const collider1 = new CircleCollider(player);
    const collider2 = new CircleCollider(event);
    const collision = collider1.testCollision(collider2);

    if (collision) {
      resolver.resolve(collision);

      expect(event.isStatic()).toBe(false);
      expect(event.position.x).toBe(initialEventPosition.x);
      expect(event.position.y).toBe(initialEventPosition.y);
      expect(player.position.x).toBeLessThan(0);
    }
  });
});
