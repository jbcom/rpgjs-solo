import { describe, it, expect } from 'vitest';
import { CapsuleCollider } from './CapsuleCollider';
import { CircleCollider } from './CircleCollider';
import { AABBCollider } from './AABBCollider';
import { Entity } from '../physics/Entity';
import { Vector2 } from '../core/math/Vector2';

describe('CapsuleCollider', () => {
    it('should create a capsule collider', () => {
        const entity = new Entity({ position: { x: 0, y: 0 }, capsule: { radius: 5, height: 20 } });
        const collider = new CapsuleCollider(entity);
        const bounds = collider.getBounds();

        // Height 20, radius 5.
        // Segment length = 20 - 2*5 = 10.
        // Half segment = 5.
        // Segment from (0, -5) to (0, 5).
        // Bounds: minX = -5, maxX = 5.
        // minY = -5 - 5 = -10. maxY = 5 + 5 = 10.

        expect(bounds.minX).toBe(-5);
        expect(bounds.maxX).toBe(5);
        expect(bounds.minY).toBe(-10);
        expect(bounds.maxY).toBe(10);
    });

    it('should detect collision with circle', () => {
        const capsule = new Entity({ position: { x: 0, y: 0 }, capsule: { radius: 5, height: 20 } });
        const circle = new Entity({ position: { x: 8, y: 0 }, radius: 4 }); // 8 units away on X. Radius sum = 5+4=9. Collision!

        const capCollider = new CapsuleCollider(capsule);
        const circCollider = new CircleCollider(circle);

        const collision = capCollider.testCollision(circCollider);
        expect(collision).not.toBeNull();
        expect(collision!.depth).toBeGreaterThan(0);
    });

    it('should detect collision with AABB', () => {
        const capsule = new Entity({ position: { x: 0, y: 0 }, capsule: { radius: 5, height: 20 } });
        const box = new Entity({ position: { x: 8, y: 0 }, width: 10, height: 10 }); // Box center at 8. Half width 5. minX = 3.
        // Capsule radius 5. MaxX = 5.
        // Overlap!

        const capCollider = new CapsuleCollider(capsule);
        const boxCollider = new AABBCollider(box);

        const collision = capCollider.testCollision(boxCollider);
        expect(collision).not.toBeNull();
    });

    it('should detect collision with another capsule', () => {
        const cap1 = new Entity({ position: { x: 0, y: 0 }, capsule: { radius: 5, height: 20 } });
        const cap2 = new Entity({ position: { x: 8, y: 0 }, capsule: { radius: 5, height: 20 } });

        const col1 = new CapsuleCollider(cap1);
        const col2 = new CapsuleCollider(cap2);

        const collision = col1.testCollision(col2);
        expect(collision).not.toBeNull();
    });

    it('should not detect collision when apart', () => {
        const cap1 = new Entity({ position: { x: 0, y: 0 }, capsule: { radius: 5, height: 20 } });
        const cap2 = new Entity({ position: { x: 20, y: 0 }, capsule: { radius: 5, height: 20 } });

        const col1 = new CapsuleCollider(cap1);
        const col2 = new CapsuleCollider(cap2);

        expect(col1.testCollision(col2)).toBeNull();
    });
});
