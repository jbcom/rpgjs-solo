#!/usr/bin/env node
/**
 * Benchmark CLI for RPG Physic
 * 
 * Run performance benchmarks separately from unit tests
 */

import { PhysicsEngine } from '../../src/api/PhysicsEngine.js';
import { AABB } from '../../src/core/math/AABB.js';
import { benchmark, formatBenchmark } from '../../src/utils/benchmark.js';

/**
 * Benchmark: 1000 entities at 60 FPS
 */
function benchmark1000Entities(): void {
  console.log('\n=== Benchmark: 1000 Dynamic Entities ===');
  const engine = new PhysicsEngine({ timeStep: 1 / 60 });
  const entities: ReturnType<typeof engine.createEntity>[] = [];

  // Create 1000 entities
  for (let i = 0; i < 1000; i++) {
    const entity = engine.createEntity({
      position: {
        x: Math.random() * 1000,
        y: Math.random() * 1000,
      },
      radius: 5 + Math.random() * 5,
      mass: 1,
      velocity: {
        x: (Math.random() - 0.5) * 10,
        y: (Math.random() - 0.5) * 10,
      },
    });
    entities.push(entity);
  }

  const result = benchmark('1000 entities step', () => {
    engine.step();
  }, 100, 10);

  console.log(formatBenchmark(result));
  console.log(`Target: < 16.67ms (60 FPS)`);
  console.log(`Status: ${result.averageTime < 16.67 ? '✓ PASS' : '✗ FAIL'}`);
}

/**
 * Benchmark: 10000 static entities
 */
function benchmark10000Static(): void {
  console.log('\n=== Benchmark: 10000 Static Entities ===');
  const engine = new PhysicsEngine({ timeStep: 1 / 60 });

  // Create 10000 static entities
  for (let i = 0; i < 10000; i++) {
    engine.createEntity({
      position: {
        x: Math.random() * 1000,
        y: Math.random() * 1000,
      },
      radius: 5,
      mass: 0, // Static
      state: 1, // Static state
    });
  }

  // Add one dynamic entity
  const dynamic = engine.createEntity({
    position: { x: 500, y: 500 },
    radius: 10,
    mass: 1,
    velocity: { x: 5, y: 0 },
  });

  const result = benchmark('10000 static + 1 dynamic step', () => {
    engine.step();
  }, 100, 10);

  console.log(formatBenchmark(result));
  console.log(`Target: < 20ms`);
  console.log(`Status: ${result.averageTime < 20 ? '✓ PASS' : '✗ FAIL'}`);
}

/**
 * Benchmark: Collision detection with many entities
 */
function benchmarkCollisions(): void {
  console.log('\n=== Benchmark: Collision Detection (400 entities) ===');
  const engine = new PhysicsEngine({ timeStep: 1 / 60 });

  // Create entities in a grid that will collide
  for (let x = 0; x < 20; x++) {
    for (let y = 0; y < 20; y++) {
      engine.createEntity({
        position: { x: x * 10, y: y * 10 },
        radius: 5,
        mass: 1,
        velocity: {
          x: (Math.random() - 0.5) * 2,
          y: (Math.random() - 0.5) * 2,
        },
      });
    }
  }

  const result = benchmark('400 entities with collisions', () => {
    engine.step();
  }, 100, 10);

  console.log(formatBenchmark(result));
}

/**
 * Benchmark: Region-based simulation
 */
function benchmarkRegions(): void {
  console.log('\n=== Benchmark: Region-Based Simulation ===');
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

  // Create entities distributed across regions
  for (let i = 0; i < 500; i++) {
    engine.createEntity({
      position: {
        x: Math.random() * 1000,
        y: Math.random() * 1000,
      },
      radius: 5,
      mass: 1,
      velocity: {
        x: (Math.random() - 0.5) * 5,
        y: (Math.random() - 0.5) * 5,
      },
    });
  }

  const result = benchmark('500 entities in regions', () => {
    engine.step();
  }, 100, 10);

  console.log(formatBenchmark(result));
  const stats = engine.getStats();
  console.log(`Active regions: ${stats.regions?.active ?? 0}`);
}

/**
 * Run all benchmarks
 */
function runAllBenchmarks(): void {
  console.log('RPG Physic Performance Benchmarks\n');
  console.log('===================================\n');

  benchmark1000Entities();
  benchmark10000Static();
  benchmarkCollisions();
  benchmarkRegions();

  console.log('\n===================================');
  console.log('Benchmarks completed!');
}

// CLI interface
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case '1000':
    benchmark1000Entities();
    break;
  case '10000':
    benchmark10000Static();
    break;
  case 'collisions':
    benchmarkCollisions();
    break;
  case 'regions':
    benchmarkRegions();
    break;
  case 'all':
  default:
    runAllBenchmarks();
    break;
}

