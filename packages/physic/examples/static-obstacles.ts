/**
 * Static Obstacles Example
 * 
 * This example demonstrates how to create immovable obstacles in a top-down RPG:
 * - Creating static obstacles (walls, trees, decorations) using mass = Infinity
 * - Creating dynamic characters that can move and collide
 * - Obstacles block player movement without being pushed
 */

import { PhysicsEngine, Vector2 } from '../src/index';

// Create physics engine for top-down RPG (no gravity)
const engine = new PhysicsEngine({
  timeStep: 1 / 60, // 60 FPS
  gravity: new Vector2(0, 0), // No gravity for top-down
});

console.log('=== Static Obstacles Example ===\n');

// Create static obstacles (walls, trees, decorations)
// These cannot be pushed and will block player movement

// Wall 1 - Using mass = Infinity
const wall1 = engine.createEntity({
  position: { x: 100, y: 0 },
  width: 20,
  height: 100,
  mass: Infinity, // Immovable obstacle
});
console.log('Created wall 1 (mass = Infinity)');

// Wall 2 - Using mass = 0 (alternative method)
const wall2 = engine.createEntity({
  position: { x: 200, y: 0 },
  width: 20,
  height: 100,
  mass: 0, // Also makes it immovable
});
console.log('Created wall 2 (mass = 0)');

// Tree obstacle
const tree = engine.createEntity({
  position: { x: 150, y: 50 },
  radius: 15,
  mass: Infinity, // Tree cannot be pushed
});
console.log('Created tree obstacle');

// Create dynamic player character
// This can move and will be blocked by obstacles
const player = engine.createEntity({
  position: { x: 0, y: 50 },
  radius: 10,
  mass: 1, // Normal mass for dynamic entity
  velocity: { x: 50, y: 0 }, // Moving right towards wall
  friction: 0.5,
});
console.log('Created player (moving towards obstacles)\n');

// Listen to collision events
engine.getEvents().onCollisionEnter((collision) => {
  const entityA = collision.entityA;
  const entityB = collision.entityB;
  
  console.log('Collision!', {
    entityA_static: entityA.isStatic(),
    entityB_static: entityB.isStatic(),
    entityA_mass: entityA.mass,
    entityB_mass: entityB.mass,
  });
});

// Simulation loop
let frameCount = 0;
const maxFrames = 120; // Simulate for 2 seconds at 60 FPS

function simulate() {
  frameCount++;
  
  // Step physics
  engine.step();

  // Log player state every 20 frames
  if (frameCount % 20 === 0) {
    console.log(`Frame ${frameCount}:`, {
      player_position: {
        x: player.position.x.toFixed(2),
        y: player.position.y.toFixed(2),
      },
      player_velocity: {
        x: player.velocity.x.toFixed(2),
        y: player.velocity.y.toFixed(2),
      },
      wall1_position: {
        x: wall1.position.x.toFixed(2),
        y: wall1.position.y.toFixed(2),
      },
    });
  }

  // Continue simulation
  if (frameCount < maxFrames) {
    setTimeout(simulate, 1000 / 60);
  } else {
    console.log('\n=== Simulation Complete ===');
    console.log('Notice: Player was blocked by obstacles');
    console.log('Notice: Obstacles did not move despite collision');
  }
}

// Start simulation
simulate();

