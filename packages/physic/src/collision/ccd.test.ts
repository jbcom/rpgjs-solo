import { describe, it, expect } from 'vitest';
import { World } from '../world/World';
import { Entity } from '../physics/Entity';
import { Vector2 } from '../core/math/Vector2';

describe('Continuous Collision Detection (CCD)', () => {
    it('should prevent tunneling for fast moving entities with continuous: true', () => {
        const world = new World();

        // Static wall at x=100, width 10 (from 95 to 105)
        const wall = world.createEntity({
            position: { x: 100, y: 0 },
            width: 10,
            height: 100,
            mass: 0 // Static
        });

        // Fast moving bullet at x=0. Radius 2.
        // Velocity 2000. Time step 1/60.
        // Step distance = 2000/60 = 33.33.
        // It will take 3 steps to reach 100.
        // Let's make it faster to jump over the wall in one frame.
        // Wall is at 95. Bullet at 0.
        // If velocity is 6000, step is 100.
        // Frame 1: 0 -> 100.
        // Wall is at 95-105.
        // 100 is inside the wall. Discrete collision might catch it if it lands INSIDE.
        // To tunnel, we need to jump OVER completely.
        // Wall width 10.
        // Start 90. Wall 100 (95-105). Target 110.
        // Jump 20 units.
        // Velocity = 20 * 60 = 1200.

        const bullet = world.createEntity({
            position: { x: 90, y: 0 },
            radius: 2,
            velocity: { x: 1200, y: 0 },
            continuous: true
        });

        // Check initial state
        expect(bullet.position.x).toBe(90);

        // Step
        world.step();

        // Without CCD, pos would be 90 + 20 = 110. (Past the wall at 105)
        // With CCD, it should stop at the wall (approx 95 - radius = 93)

        expect(bullet.position.x).toBeLessThan(105);
        expect(bullet.position.x).toBeGreaterThan(90);

        // Should be close to impact point
        // Wall minX = 95. Bullet radius 2. Impact at 93.
        // Allow some epsilon
        expect(bullet.position.x).toBeCloseTo(93, 0);
    });

    it('should tunnel if continuous is false', () => {
        const world = new World();

        const wall = world.createEntity({
            position: { x: 100, y: 0 },
            width: 10,
            height: 100,
            type: 'static'
        });

        // Start 90. Jump 20 to 110. Wall at 95-105.
        const bullet = world.createEntity({
            position: { x: 90, y: 0 },
            radius: 2,
            velocity: { x: 1200, y: 0 },
            continuous: false // Default
        });

        world.step();

        // Should tunnel through
        expect(bullet.position.x).toBeCloseTo(110, 0);
    });
});
