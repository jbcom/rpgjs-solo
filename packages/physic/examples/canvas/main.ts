/**
 * Canvas example using RPG Physic
 * 
 * Demonstrates:
 * - Physics simulation with visual rendering
 * - Mouse interaction (click to add entities)
 * - Collision detection and response
 * - Forces and explosions
 */

import { PhysicsEngine, Vector2, AABB, applyExplosion } from '../../src/index.js';

// Get canvas and context
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const clearBtn = document.getElementById('clearBtn') as HTMLButtonElement;
const addBallsBtn = document.getElementById('addBallsBtn') as HTMLButtonElement;
const explosionBtn = document.getElementById('explosionBtn') as HTMLButtonElement;
const infoEl = document.getElementById('info') as HTMLSpanElement;

// Create physics engine
const engine = new PhysicsEngine({
  timeStep: 1 / 60,
  gravity: new Vector2(0, 0), // Top-down, no gravity
});

// Create ground/walls
const ground = engine.createEntity({
  position: { x: 400, y: 580 },
  width: 800,
  height: 20,
  mass: 0, // Static
  state: 1, // Static state
  restitution: 0.8,
});

const leftWall = engine.createEntity({
  position: { x: 10, y: 300 },
  width: 20,
  height: 600,
  mass: 0,
  state: 1,
  restitution: 0.8,
});

const rightWall = engine.createEntity({
  position: { x: 790, y: 300 },
  width: 20,
  height: 600,
  mass: 0,
  state: 1,
  restitution: 0.8,
});

const topWall = engine.createEntity({
  position: { x: 400, y: 10 },
  width: 800,
  height: 20,
  mass: 0,
  state: 1,
  restitution: 0.8,
});

// Track entities for rendering
const entities: Array<{ entity: ReturnType<typeof engine.createEntity>; color: string }> = [];

// Add initial entities
function addBall(x: number, y: number, color?: string): void {
  const entity = engine.createEntity({
    position: { x, y },
    radius: 10 + Math.random() * 10,
    mass: 1,
    velocity: {
      x: (Math.random() - 0.5) * 200,
      y: (Math.random() - 0.5) * 200,
    },
    restitution: 0.7 + Math.random() * 0.3,
    friction: 0.3,
  });

  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7', '#a29bfe', '#fd79a8'];
  entities.push({
    entity,
    color: color || colors[Math.floor(Math.random() * colors.length)]!,
  });
}

// Add 10 random balls
function addRandomBalls(): void {
  for (let i = 0; i < 10; i++) {
    addBall(
      100 + Math.random() * 600,
      100 + Math.random() * 400
    );
  }
}

// Clear all dynamic entities
function clearEntities(): void {
  entities.forEach(({ entity }) => {
    engine.removeEntity(entity);
  });
  entities.length = 0;
}

// Explosion at mouse position
function createExplosion(x: number, y: number): void {
  entities.forEach(({ entity }) => {
    applyExplosion(entity, new Vector2(x, y), 500, 150, 1.5);
  });
}

// Mouse interaction
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  addBall(x, y);
});

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  createExplosion(x, y);
});

// Button handlers
clearBtn.addEventListener('click', () => {
  clearEntities();
});

addBallsBtn.addEventListener('click', () => {
  addRandomBalls();
});

explosionBtn.addEventListener('click', () => {
  createExplosion(canvas.width / 2, canvas.height / 2);
});

// Render function
function render(): void {
  // Clear canvas
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Render walls (static entities)
  ctx.fillStyle = '#444';
  ctx.fillRect(ground.position.x - ground.width / 2, ground.position.y - ground.height / 2, ground.width, ground.height);
  ctx.fillRect(leftWall.position.x - leftWall.width / 2, leftWall.position.y - leftWall.height / 2, leftWall.width, leftWall.height);
  ctx.fillRect(rightWall.position.x - rightWall.width / 2, rightWall.position.y - rightWall.height / 2, rightWall.width, rightWall.height);
  ctx.fillRect(topWall.position.x - topWall.width / 2, topWall.position.y - topWall.height / 2, topWall.width, topWall.height);

  // Render dynamic entities
  entities.forEach(({ entity, color }) => {
    ctx.save();
    ctx.translate(entity.position.x, entity.position.y);
    ctx.rotate(entity.rotation);

    // Draw circle
    ctx.beginPath();
    ctx.arc(0, 0, entity.radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw velocity vector
    const velLength = entity.velocity.length();
    if (velLength > 0.1) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(
        (entity.velocity.x / velLength) * entity.radius * 1.5,
        (entity.velocity.y / velLength) * entity.radius * 1.5
      );
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  });

  // Update info
  infoEl.textContent = `Entities: ${entities.length} | FPS: ${Math.round(1000 / 16.67)}`;
}

// Game loop
let lastTime = performance.now();
function gameLoop(): void {
  const currentTime = performance.now();
  const deltaTime = currentTime - lastTime;
  lastTime = currentTime;

  // Step physics (fixed timestep)
  const steps = Math.floor(deltaTime / (1000 / 60));
  for (let i = 0; i < steps; i++) {
    engine.step();
  }

  // Render
  render();

  requestAnimationFrame(gameLoop);
}

// Start simulation
addRandomBalls();
gameLoop();

