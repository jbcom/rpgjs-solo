/**
 * Example: Using forces and constraints
 * 
 * This example demonstrates:
 * - Applying various forces
 * - Using constraints (springs, anchors)
 * - Force fields and explosions
 */

import { PhysicsEngine, Vector2, applyAttraction, applyRepulsion, applyExplosion, SpringConstraint } from '../src/index';

const engine = new PhysicsEngine({ timeStep: 1 / 60 });

// Create entities
const center = engine.createEntity({
  position: { x: 400, y: 300 },
  radius: 20,
  mass: 0, // Static center
});

const orbiting = engine.createEntity({
  position: { x: 500, y: 300 },
  radius: 10,
  mass: 1,
  velocity: { x: 0, y: 5 },
});

// Create spring constraint
const spring = new SpringConstraint(center, orbiting, 100, 0.1, 0.05);

// Simulation loop
function simulate() {
  // Apply attraction to center
  applyAttraction(orbiting, center.position, 50);

  // Update spring constraint
  spring.update(1 / 60);

  // Step physics
  engine.step();

  console.log('Orbiting entity:', {
    x: orbiting.position.x,
    y: orbiting.position.y,
    distance: center.position.distanceTo(orbiting.position),
  });

  setTimeout(simulate, 1000 / 60);
}

simulate();

