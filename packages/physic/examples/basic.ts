/**
 * Basic example of using RPG Physic
 * 
 * This example demonstrates:
 * - Creating a physics engine
 * - Adding entities
 * - Stepping the simulation
 * - Handling collisions
 */

import { PhysicsEngine, Vector2 } from '../src/index';

// Create physics engine
const engine = new PhysicsEngine({
  timeStep: 1 / 60, // 60 FPS
});

// Create a static ground entity
const ground = engine.createEntity({
  position: { x: 0, y: 0 },
  width: 100,
  height: 10,
  mass: 0, // Static (infinite mass)
  state: 1, // Static state
});

// Create a dynamic ball
const ball = engine.createEntity({
  position: { x: 0, y: 50 },
  radius: 5,
  mass: 1,
  velocity: { x: 0, y: -10 },
  restitution: 0.8, // Bouncy
});

// Listen to collision events
engine.getEvents().onCollisionEnter((collision) => {
  console.log('Collision detected!', {
    entityA: collision.entityA.uuid,
    entityB: collision.entityB.uuid,
  });
});

// Simulation loop
function simulate() {
  // Step physics
  engine.step();

  // Log ball position
  console.log('Ball position:', {
    x: ball.position.x,
    y: ball.position.y,
    velocity: {
      x: ball.velocity.x,
      y: ball.velocity.y,
    },
  });

  // Continue simulation
  setTimeout(simulate, 1000 / 60);
}

// Start simulation
simulate();

