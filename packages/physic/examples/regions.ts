/**
 * Example: Using regions for distributed simulation
 * 
 * This example demonstrates:
 * - Creating a region-based physics engine
 * - Entity migration between regions
 * - Region activation/deactivation
 */

import { PhysicsEngine, AABB } from '../src/index';

// Create engine with regions enabled
const engine = new PhysicsEngine({
  timeStep: 1 / 60,
  enableRegions: true,
  regionConfig: {
    worldBounds: new AABB(0, 0, 1000, 1000),
    regionSize: 200,
    overlap: 20,
    autoActivate: true,
  },
});

// Create entities in different regions
const entity1 = engine.createEntity({
  position: { x: 100, y: 100 },
  radius: 10,
  mass: 1,
  velocity: { x: 5, y: 0 },
});

const entity2 = engine.createEntity({
  position: { x: 500, y: 500 },
  radius: 10,
  mass: 1,
  velocity: { x: -5, y: 0 },
});

// Listen to events
engine.getEvents().onCollisionEnter((collision) => {
  console.log('Collision in region:', {
    entityA: collision.entityA.uuid,
    entityB: collision.entityB.uuid,
  });
});

// Simulation loop
function simulate() {
  engine.step();

  const stats = engine.getStats();
  console.log('Stats:', stats);

  // Check if entity moved to different region
  const regionManager = engine.getRegionManager();
  if (regionManager) {
    const region = regionManager.getEntityRegion(entity1);
    console.log('Entity1 region:', region ? 'active' : 'none');
  }

  setTimeout(simulate, 1000 / 60);
}

simulate();

