/**
 * RPG Example using RPG Physic
 * 
 * Demonstrates:
 * - Hero movement with keyboard controls
 * - NPCs (Non-Player Characters)
 * - Static environment (walls, obstacles, trees)
 * - Camera following the hero
 * - Collision detection and response
 */

import {
  PhysicsEngine,
  Vector2,
  Entity,
  CollisionInfo,
  Dash,
  LinearMove,
  Knockback,
  PathFollow,
  Oscillate,
  CompositeMovement,
  SeekAvoid,
} from '../../src/index.js';
import type { MovementStrategy } from '../../src/index.js';

// Get canvas and context
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const infoEl = document.getElementById('info') as HTMLSpanElement;
const debugControls = document.getElementById('debug-controls') as HTMLDivElement | null;
const debugStatusEl = document.getElementById('debug-status') as HTMLParagraphElement | null;
const npcFocusEl = document.getElementById('npc-focus') as HTMLParagraphElement | null;

// World dimensions
const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 1500;
const CELL_SIZE = 200;

// Create physics engine
const engine = new PhysicsEngine({
  timeStep: 1 / 60,
  gravity: new Vector2(0, 0), // Top-down, no gravity
  spatialCellSize: CELL_SIZE,
  // Grid dimensions = world size / cell size (number of cells)
  spatialGridWidth: Math.ceil(WORLD_WIDTH / CELL_SIZE),  // 10 cells
  spatialGridHeight: Math.ceil(WORLD_HEIGHT / CELL_SIZE), // 8 cells
});
const movement = engine.getMovementManager();

// Track collisions with static obstacles for hero blocking
const heroCollisionNormals: Vector2[] = [];
const activeHeroCollisions: Map<string, CollisionInfo> = new Map();

// Track collisions with static obstacles for NPCs blocking
const npcCollisionNormals: Map<string, Vector2[]> = new Map();
const activeNpcCollisions: Map<string, CollisionInfo> = new Map();

// Game state
interface GameEntity {
  entity: Entity;
  type: 'hero' | 'npc' | 'wall' | 'obstacle' | 'tree';
  color: string;
  name?: string;
  debugPulse?: number;
}

const gameEntities: GameEntity[] = [];
let hero: GameEntity | null = null;

// Keyboard state
const keys: { [key: string]: boolean } = {};
const moveSpeed = 200; // pixels per second
const DEBUG_PULSE_DURATION = 1.5;
let npcCursor = 0;
let lastNpcTriggered: GameEntity | null = null;

type DebugAction = {
  id: string;
  label: string;
  description: string;
  scope: 'single' | 'all';
  run?: (npc: GameEntity) => void;
  runAll?: (npcs: GameEntity[]) => void;
};

function formatNpcName(entity: GameEntity): string {
  return entity.name ?? `NPC ${entity.entity.uuid.slice(0, 4).toUpperCase()}`;
}

function setDebugStatus(message: string): void {
  if (debugStatusEl) {
    debugStatusEl.textContent = message;
  }
}

function setNpcFocus(customMessage?: string): void {
  if (!npcFocusEl) return;
  if (customMessage) {
    npcFocusEl.textContent = customMessage;
    return;
  }
  if (lastNpcTriggered) {
    npcFocusEl.textContent = `Dernier NPC ciblé : ${formatNpcName(lastNpcTriggered)}`;
  } else {
    npcFocusEl.textContent = 'Dernier NPC ciblé : -';
  }
}

// Camera
const camera = {
  x: 0,
  y: 0,
  targetX: 0,
  targetY: 0,
  lerp: 0.1, // Smooth camera follow
};

// Create world boundaries (walls)
function createWalls(): void {
  const wallThickness = 30;

  // Top wall
  const topWall = engine.createEntity({
    position: { x: WORLD_WIDTH / 2, y: wallThickness / 2 },
    width: WORLD_WIDTH,
    height: wallThickness,
    mass: Infinity, // Immovable
  });
  gameEntities.push({ entity: topWall, type: 'wall', color: '#555' });

  // Bottom wall
  const bottomWall = engine.createEntity({
    position: { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT - wallThickness / 2 },
    width: WORLD_WIDTH,
    height: wallThickness,
    mass: Infinity,
  });
  gameEntities.push({ entity: bottomWall, type: 'wall', color: '#555' });

  // Left wall
  const leftWall = engine.createEntity({
    position: { x: wallThickness / 2, y: WORLD_HEIGHT / 2 },
    width: wallThickness,
    height: WORLD_HEIGHT,
    mass: Infinity,
  });
  gameEntities.push({ entity: leftWall, type: 'wall', color: '#555' });

  // Right wall
  const rightWall = engine.createEntity({
    position: { x: WORLD_WIDTH - wallThickness / 2, y: WORLD_HEIGHT / 2 },
    width: wallThickness,
    height: WORLD_HEIGHT,
    mass: Infinity,
  });
  gameEntities.push({ entity: rightWall, type: 'wall', color: '#555' });
}

// Create obstacles (rocks, boxes, etc.)
function createObstacles(): void {
  const obstacles = [
    { x: 400, y: 300, w: 60, h: 60 },
    { x: 600, y: 500, w: 80, h: 40 },
    { x: 800, y: 200, w: 50, h: 80 },
    { x: 1200, y: 400, w: 70, h: 70 },
    { x: 1500, y: 600, w: 90, h: 50 },
    { x: 300, y: 800, w: 40, h: 100 },
    { x: 1000, y: 1000, w: 100, h: 40 },
  ];

  obstacles.forEach((obs) => {
    const entity = engine.createEntity({
      position: { x: obs.x, y: obs.y },
      width: obs.w,
      height: obs.h,
      mass: Infinity, // Immovable
    });
    gameEntities.push({ entity, type: 'obstacle', color: '#666' });
  });
}

// Create trees (decorative static entities)
function createTrees(): void {
  const trees = [
    { x: 200, y: 200, size: 40 },
    { x: 350, y: 450, size: 35 },
    { x: 700, y: 350, size: 45 },
    { x: 900, y: 700, size: 40 },
    { x: 1300, y: 250, size: 50 },
    { x: 1600, y: 450, size: 35 },
    { x: 500, y: 1000, size: 40 },
    { x: 1400, y: 900, size: 45 },
  ];

  trees.forEach((tree) => {
    const entity = engine.createEntity({
      position: { x: tree.x, y: tree.y },
      radius: tree.size / 2,
      mass: Infinity, // Immovable
    });
    gameEntities.push({ entity, type: 'tree', color: '#8b4513' });
  });
}

// Create NPCs
function createNPCs(): void {
  const npcs = [
    { x: 500, y: 400, name: 'NPC 1' },
    { x: 800, y: 600, name: 'NPC 2' },
    { x: 1100, y: 300, name: 'NPC 3' },
    { x: 1300, y: 800, name: 'NPC 4' },
    { x: 600, y: 1000, name: 'NPC 5' },
  ];

  npcs.forEach((npc) => {
    const entity = engine.createEntity({
      position: { x: npc.x, y: npc.y },
      radius: 20,
      mass: 8,
      linearDamping: 1.2,
      friction: 0.6,
    });
    gameEntities.push({
      entity,
      type: 'npc',
      color: '#2ecc71',
      name: npc.name,
    });
  });
}

// Create hero
function createHero(): void {
  const heroEntity = engine.createEntity({
    position: { x: 300, y: 300 },
    radius: 25,
    mass: 1,
    friction: 0.4,
    linearDamping: 0.2,
    maxLinearVelocity: moveSpeed,
  });

  hero = {
    entity: heroEntity,
    type: 'hero',
    color: '#3498db',
    name: 'Hero',
  };
  gameEntities.push(hero);
}

function getNPCs(): GameEntity[] {
  return gameEntities.filter((entity) => entity.type === 'npc');
}

function nextNPC(): GameEntity | null {
  const npcs = getNPCs();
  if (npcs.length === 0) {
    console.warn('[debug] No NPC available to apply a movement strategy.');
    setDebugStatus('Aucun NPC disponible pour appliquer un mouvement.');
    return null;
  }
  const npc = npcs[npcCursor % npcs.length];
  npcCursor = (npcCursor + 1) % npcs.length;
  return npc;
}

function highlightEntity(entity: GameEntity): void {
  entity.debugPulse = DEBUG_PULSE_DURATION;
  lastNpcTriggered = entity;
  setNpcFocus();
}

function decayDebugPulses(deltaTime: number): void {
  gameEntities.forEach((gameEntity) => {
    if (gameEntity.debugPulse && gameEntity.debugPulse > 0) {
      gameEntity.debugPulse = Math.max(0, gameEntity.debugPulse - deltaTime);
    }
  });
}

function scheduleStrategy(target: GameEntity, strategy: MovementStrategy, label: string): void {
  movement.clear(target.entity);
  movement.add(target.entity, strategy);
  target.entity.setVelocity({ x: 0, y: 0 });
  highlightEntity(target);
  setDebugStatus(`${label} → ${formatNpcName(target)}`);
}

function createDebugButtons(): void {
  if (!debugControls) {
    return;
  }

  const actions: DebugAction[] = [
    {
      id: 'dash',
      label: 'Dash impulsion',
      description: 'Applique un dash rapide dans une direction aléatoire sur le prochain NPC.',
      scope: 'single',
      run: (npc) => {
        const angle = Math.random() * Math.PI * 2;
        const direction = { x: Math.cos(angle), y: Math.sin(angle) };
        scheduleStrategy(npc, new Dash(220, direction, 0.25), 'Dash impulsion');
      },
    },
    {
      id: 'linear-east',
      label: 'Push linéaire Est',
      description: 'Déplace le prochain NPC vers l’Est avec une vitesse constante.',
      scope: 'single',
      run: (npc) => {
        scheduleStrategy(npc, new LinearMove({ x: 160, y: 0 }, 1.5), 'Push linéaire');
      },
    },
    {
      id: 'oscillate',
      label: 'Oscillation verticale',
      description: 'Fait osciller le prochain NPC de haut en bas pendant quelques secondes.',
      scope: 'single',
      run: (npc) => {
        scheduleStrategy(npc, new Oscillate({ x: 0, y: 1 }, 100, 2, 'sine', 6), 'Oscillation verticale');
      },
    },
    {
      id: 'patrol',
      label: 'Patrouille carrée',
      description: 'Tous les NPCs patrouillent en boucle sur un carré autour de leur position.',
      scope: 'all',
      runAll: (npcs) => {
        npcs.forEach((npc) => {
          const { x, y } = npc.entity.position;
          const size = 180;
          const waypoints = [
            { x: x + size, y },
            { x: x + size, y: y + size },
            { x, y: y + size },
            { x, y },
          ];
          scheduleStrategy(npc, new PathFollow(waypoints, 140, true, 0.5), 'Patrouille carrée');
        });
        lastNpcTriggered = null;
        setNpcFocus('Dernier NPC ciblé : tous les NPCs');
        setDebugStatus(`Patrouille carrée appliquée sur ${npcs.length} NPCs.`);
      },
    },
    {
      id: 'knockback',
      label: 'Knockback radial',
      description: 'Repousse tous les NPCs à partir du héros (ou du centre) comme une explosion.',
      scope: 'all',
      runAll: (npcs) => {
        const origin = hero?.entity.position.clone() ?? new Vector2(0, 0);

        npcs.forEach((npc) => {
          // Direction from origin to NPC (outward)
          const direction = new Vector2(
            npc.entity.position.x - origin.x,
            npc.entity.position.y - origin.y,
          );
          if (direction.length() === 0) {
            direction.set(1, 0);
          } else {
            direction.normalizeInPlace();
          }
          scheduleStrategy(
            npc,
            new Knockback({ x: direction.x, y: direction.y }, 300, 0.5, 0.3),
            'Knockback radial',
          );
        });
        lastNpcTriggered = null;
        setNpcFocus('Dernier NPC ciblé : tous les NPCs');
        setDebugStatus(`Knockback radial appliqué sur ${npcs.length} NPCs.`);
      },
    },
    {
      id: 'seek-avoid-hero',
      label: 'Seek & Avoid (Hero)',
      description: 'Applique SeekAvoid sur le prochain NPC pour poursuite du héros avec évitement.',
      scope: 'single',
      run: (npc) => {
        if (!hero) {
          setDebugStatus('SeekAvoid non disponible : le héros est introuvable.');
          return;
        }
        const strategy = new SeekAvoid(engine, () => hero!.entity, 180, 140, 80, 48);
        scheduleStrategy(npc, strategy, 'Seek & Avoid (Hero)');
      },
    },
    {
      id: 'combo',
      label: 'Combo dash + wave',
      description: 'Dash suivi d’une oscillation latérale pour le prochain NPC.',
      scope: 'single',
      run: (npc) => {
        const angle = Math.random() * Math.PI * 2;
        const dashDirection = { x: Math.cos(angle), y: Math.sin(angle) };
        const perpendicular = { x: -dashDirection.y, y: dashDirection.x };
        const combo = new CompositeMovement('sequence', [
          new Dash(200, dashDirection, 0.2),
          new Oscillate(perpendicular, 80, 1.5, 'sine', 3),
        ]);
        scheduleStrategy(npc, combo, 'Combo dash + wave');
      },
    },
    {
      id: 'random-drift',
      label: 'Drift diagonal',
      description: 'Applique un mouvement linéaire diagonal au prochain NPC.',
      scope: 'single',
      run: (npc) => {
        const direction = Math.random() > 0.5 ? { x: 100, y: 120 } : { x: -120, y: 100 };
        scheduleStrategy(npc, new LinearMove(direction, 2), 'Drift diagonal');
      },
    },
    {
      id: 'stop-single',
      label: 'Stop NPC',
      description: 'Annule les mouvements du prochain NPC et le fige sur place.',
      scope: 'single',
      run: (npc) => {
        movement.clear(npc.entity);
        npc.entity.setVelocity({ x: 0, y: 0 });
        highlightEntity(npc);
        setDebugStatus(`Mouvements arrêtés pour ${formatNpcName(npc)}.`);
      },
    },
    {
      id: 'stop-all',
      label: 'Stop tous les NPCs',
      description: 'Réinitialise toutes les stratégies et stoppe instantanément chaque NPC.',
      scope: 'all',
      runAll: (npcs) => {
        movement.clearAll();
        npcs.forEach((npc) => {
          npc.entity.setVelocity({ x: 0, y: 0 });
          npc.debugPulse = DEBUG_PULSE_DURATION * 0.5;
        });
        lastNpcTriggered = null;
        setNpcFocus('Dernier NPC ciblé : tous les NPCs');
        setDebugStatus('Tous les mouvements ont été arrêtés.');
      },
    },
  ];

  debugControls.innerHTML = '';

  actions.forEach((action) => {
    const card = document.createElement('article');
    card.className = 'debug-card';

    const badge = document.createElement('span');
    badge.className = 'debug-card__badge';
    badge.textContent = action.scope === 'all' ? 'Tous les NPCs' : 'NPC ciblé';

    const title = document.createElement('h3');
    title.textContent = action.label;

    const description = document.createElement('p');
    description.textContent = action.description;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'debug-card__button';
    button.textContent = action.scope === 'all'
      ? 'Appliquer à tous'
      : 'Appliquer au prochain NPC';

    button.addEventListener('click', () => {
      const npcs = getNPCs();
      if (npcs.length === 0) {
        setDebugStatus('Aucun NPC disponible pour appliquer un mouvement.');
        return;
      }

      if (action.scope === 'all' && action.runAll) {
        action.runAll(npcs);
        return;
      }

      if (action.scope === 'single' && action.run) {
        const npc = nextNPC();
        if (!npc) return;
        action.run(npc);
      }
    });

    card.appendChild(badge);
    card.appendChild(title);
    card.appendChild(description);
    card.appendChild(button);
    debugControls.appendChild(card);
  });

  setDebugStatus('Sélectionnez un mouvement pour l’appliquer sur les NPCs.');
  setNpcFocus();
}

// Keyboard event handlers
document.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  keys[e.key] = true; // Also handle arrow keys
});

document.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
  keys[e.key] = false;
});

// Update hero movement
function updateHeroMovement(deltaTime: number): void {
  if (!hero) return;

  const move = new Vector2(0, 0);

  // WASD or Arrow keys
  if (keys['w'] || keys['arrowup'] || keys['z']) {
    move.y -= 1;
  }
  if (keys['s'] || keys['arrowdown']) {
    move.y += 1;
  }
  if (keys['a'] || keys['arrowleft'] || keys['q']) {
    move.x -= 1;
  }
  if (keys['d'] || keys['arrowright']) {
    move.x += 1;
  }

  // Normalize diagonal movement
  if (move.length() > 0) {
    move.normalizeInPlace();
    let desiredVelocity = move.mul(moveSpeed);

    // Block movement in directions of collisions with static obstacles
    // Normal points from hero to obstacle, so we block positive dot products (moving towards obstacle)
    for (const normal of heroCollisionNormals) {
      const velocityAlongNormal = desiredVelocity.dot(normal);
      if (velocityAlongNormal > 0) {
        // Moving towards the obstacle, remove that component
        desiredVelocity = desiredVelocity.sub(normal.mul(velocityAlongNormal));
      }
    }

    hero.entity.setVelocity(desiredVelocity);
  } else {
    // Apply damping when no input
    hero.entity.setVelocity(new Vector2(0, 0));
  }
}

// Block hero velocity if colliding with static obstacles
function blockHeroVelocityOnCollision(): void {
  if (!hero) return;

  // After collision detection, if hero is colliding, cancel velocity towards obstacles
  if (heroCollisionNormals.length > 0) {
    let velocity = hero.entity.velocity;
    
    // For each collision normal, remove velocity component pointing towards obstacle
    // Normal points from hero to obstacle, so we block positive dot products
    for (const normal of heroCollisionNormals) {
      const velocityAlongNormal = velocity.dot(normal);
      if (velocityAlongNormal > 0) {
        // Moving towards obstacle, cancel that component
        velocity = velocity.sub(normal.mul(velocityAlongNormal));
      }
    }
    
    hero.entity.setVelocity(velocity);
  }
}

// Update collision normals from active collisions
function updateHeroCollisionNormals(): void {
  if (!hero) return;

  // Clear previous collision normals
  heroCollisionNormals.length = 0;

  // Get normals from active collisions
  for (const collision of activeHeroCollisions.values()) {
    heroCollisionNormals.push(collision.normal.clone());
  }
}

// Update collision normals for NPCs from active collisions
function updateNpcCollisionNormals(): void {
  // Clear previous collision normals
  npcCollisionNormals.clear();

  // Get normals from active collisions
  for (const [key, collision] of activeNpcCollisions.entries()) {
    const npcId = key.split('-')[0];
    if (!npcCollisionNormals.has(npcId)) {
      npcCollisionNormals.set(npcId, []);
    }
    npcCollisionNormals.get(npcId)!.push(collision.normal.clone());
  }
}

// Block NPC velocity if colliding with static obstacles
function blockNpcVelocityOnCollision(): void {
  const npcs = gameEntities.filter((e) => e.type === 'npc');
  
  for (const npc of npcs) {
    const normals = npcCollisionNormals.get(npc.entity.uuid);
    if (!normals || normals.length === 0) continue;

    let velocity = npc.entity.velocity;
    
    // For each collision normal, remove velocity component pointing towards obstacle
    for (const normal of normals) {
      const velocityAlongNormal = velocity.dot(normal);
      if (velocityAlongNormal > 0) {
        // Moving towards obstacle, cancel that component
        velocity = velocity.sub(normal.mul(velocityAlongNormal));
      }
    }
    
    npc.entity.setVelocity(velocity);
  }
}

// Update NPCs (simple AI: random wandering)
// Note: Disabled because NPCs are now static (mass: Infinity)
// If you want NPCs to move, set mass: 1 or higher and uncomment this function
function updateNPCs(deltaTime: number): void {
  // const npcs = gameEntities.filter((e) => e.type === 'npc');
  
  // npcs.forEach((npc) => {
  //   // Random chance to change direction
  //   if (Math.random() < 0.01) {
  //     const angle = Math.random() * Math.PI * 2;
  //     const speed = 50 + Math.random() * 50;
  //     const velocity = new Vector2(
  //       Math.cos(angle) * speed,
  //       Math.sin(angle) * speed
  //     );
  //     npc.entity.setVelocity(velocity);
  //   }
  // });
}

// Update camera to follow hero
function updateCamera(): void {
  if (!hero) return;

  camera.targetX = hero.entity.position.x - canvas.width / 2;
  camera.targetY = hero.entity.position.y - canvas.height / 2;

  // Smooth camera follow
  camera.x += (camera.targetX - camera.x) * camera.lerp;
  camera.y += (camera.targetY - camera.y) * camera.lerp;
}

// Render function
function render(): void {
  // Clear canvas with background
  ctx.fillStyle = '#2d5016'; // Green grass color
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Apply camera transform
  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  // Render all entities
  gameEntities.forEach((gameEntity) => {
    const { entity, type, color } = gameEntity;

    ctx.save();
    ctx.translate(entity.position.x, entity.position.y);
    ctx.rotate(entity.rotation);

    if (type === 'tree') {
      // Draw tree (circle with brown trunk and green top)
      const radius = entity.radius;
      
      // Trunk
      ctx.fillStyle = '#654321';
      ctx.beginPath();
      ctx.arc(0, radius * 0.3, radius * 0.3, 0, Math.PI * 2);
      ctx.fill();
      
      // Leaves
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, -radius * 0.2, radius * 0.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (entity.radius > 0) {
      // Circle entity (hero, NPC)
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, entity.radius, 0, Math.PI * 2);
      ctx.fill();
      
      // Border
      ctx.strokeStyle = type === 'hero' ? '#fff' : '#1e8449';
      ctx.lineWidth = type === 'hero' ? 3 : 2;
      ctx.stroke();

      const pulse = gameEntity.debugPulse ?? 0;
      if (pulse > 0) {
        ctx.strokeStyle = `rgba(241, 196, 15, ${Math.min(pulse, 1)})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, entity.radius + 8, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Draw direction indicator for hero
      if (type === 'hero' && entity.velocity.length() > 1) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        const dir = entity.velocity.normalize();
        ctx.lineTo(dir.x * entity.radius * 1.5, dir.y * entity.radius * 1.5);
        ctx.stroke();
      }
    } else {
      // Rectangle entity (wall, obstacle)
      ctx.fillStyle = color;
      ctx.fillRect(
        -entity.width / 2,
        -entity.height / 2,
        entity.width,
        entity.height
      );
      
      // Border
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        -entity.width / 2,
        -entity.height / 2,
        entity.width,
        entity.height
      );
    }

    // Draw name above NPCs
    if (type === 'npc' && gameEntity.name) {
      ctx.restore();
      ctx.save();
      ctx.translate(entity.position.x, entity.position.y - entity.radius - 15);
      ctx.scale(1, 1); // Reset rotation for text
      ctx.fillStyle = '#fff';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(gameEntity.name, 0, 0);
      ctx.restore();
      return;
    }

    ctx.restore();
  });

  // Draw hero name
  if (hero) {
    ctx.save();
    ctx.translate(hero.entity.position.x, hero.entity.position.y - hero.entity.radius - 15);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeText('Hero', 0, 0);
    ctx.fillText('Hero', 0, 0);
    ctx.restore();
  }

  ctx.restore();

  // Update info
  const npcCount = gameEntities.filter((e) => e.type === 'npc').length;
  if (hero) {
    infoEl.textContent = `Position: (${Math.round(hero.entity.position.x)}, ${Math.round(hero.entity.position.y)}) | NPCs: ${npcCount} | FPS: ${Math.round(1000 / 16.67)}`;
  }
}

// Game loop
let lastTime = performance.now();
function gameLoop(): void {
  const currentTime = performance.now();
  const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
  lastTime = currentTime;

  // Update NPCs
  updateNPCs(deltaTime);

  // Step physics (fixed timestep)
  const fixedDeltaTime = 1 / 60;
  const steps = Math.max(1, Math.floor(deltaTime / fixedDeltaTime));
  for (let i = 0; i < steps; i++) {
    // Update collision normals from active collisions (set by events)
    updateHeroCollisionNormals();
    updateNpcCollisionNormals();
    
    // Before step: update hero movement based on input and collision blocking
    updateHeroMovement(fixedDeltaTime);
    
    engine.stepWithMovements(fixedDeltaTime);
    
    // After physics step, block velocity if still colliding with static obstacles
    blockHeroVelocityOnCollision();
    blockNpcVelocityOnCollision();
    decayDebugPulses(fixedDeltaTime);
  }

  // Update camera
  updateCamera();

  // Render
  render();

  requestAnimationFrame(gameLoop);
}

// Setup collision event handlers for hero and NPC blocking
function setupCollisionHandlers(): void {
  const events = engine.getEvents();
  
  // Listen for collisions involving the hero or NPCs
  events.onCollisionEnter((collision: CollisionInfo) => {
    // Handle hero collisions
    if (hero) {
      const isHeroA = collision.entityA.uuid === hero.entity.uuid;
      const isHeroB = collision.entityB.uuid === hero.entity.uuid;
      
      if (isHeroA || isHeroB) {
        const otherEntity = isHeroA ? collision.entityB : collision.entityA;
        const normal = isHeroA ? collision.normal : collision.normal.mul(-1);
        
        // Check if other entity is a static obstacle
        const gameEntity = gameEntities.find((e) => e.entity.uuid === otherEntity.uuid);
        if (gameEntity && 
            (gameEntity.type === 'wall' || gameEntity.type === 'obstacle' || gameEntity.type === 'tree' || gameEntity.type === 'npc') &&
            otherEntity.isStatic()) {
          // Store collision info with corrected normal (from hero to obstacle)
          const collisionKey = `${hero.entity.uuid}-${otherEntity.uuid}`;
          activeHeroCollisions.set(collisionKey, {
            entityA: isHeroA ? collision.entityA : collision.entityB,
            entityB: isHeroA ? collision.entityB : collision.entityA,
            contacts: collision.contacts,
            normal: normal.clone(),
            depth: collision.depth,
          });
        }
      }
    }

    // Handle NPC collisions with static obstacles
    const entityAGame = gameEntities.find((e) => e.entity.uuid === collision.entityA.uuid);
    const entityBGame = gameEntities.find((e) => e.entity.uuid === collision.entityB.uuid);
    
    // Check if one is an NPC and the other is a static obstacle
    if (entityAGame && entityAGame.type === 'npc' && collision.entityB.isStatic()) {
      const collisionKey = `${collision.entityA.uuid}-${collision.entityB.uuid}`;
      activeNpcCollisions.set(collisionKey, {
        entityA: collision.entityA,
        entityB: collision.entityB,
        contacts: collision.contacts,
        normal: collision.normal.clone(),
        depth: collision.depth,
      });
    } else if (entityBGame && entityBGame.type === 'npc' && collision.entityA.isStatic()) {
      const collisionKey = `${collision.entityB.uuid}-${collision.entityA.uuid}`;
      activeNpcCollisions.set(collisionKey, {
        entityA: collision.entityB,
        entityB: collision.entityA,
        contacts: collision.contacts,
        normal: collision.normal.mul(-1),
        depth: collision.depth,
      });
    }
  });
  
  events.onCollisionExit((collision: CollisionInfo) => {
    // Handle hero collision exit
    if (hero) {
      const isHeroA = collision.entityA.uuid === hero.entity.uuid;
      const isHeroB = collision.entityB.uuid === hero.entity.uuid;
      
      if (isHeroA || isHeroB) {
        const otherEntity = isHeroA ? collision.entityB : collision.entityA;
        const collisionKey = `${hero.entity.uuid}-${otherEntity.uuid}`;
        activeHeroCollisions.delete(collisionKey);
      }
    }

    // Handle NPC collision exit
    const entityAGame = gameEntities.find((e) => e.entity.uuid === collision.entityA.uuid);
    const entityBGame = gameEntities.find((e) => e.entity.uuid === collision.entityB.uuid);
    
    if (entityAGame && entityAGame.type === 'npc') {
      const collisionKey = `${collision.entityA.uuid}-${collision.entityB.uuid}`;
      activeNpcCollisions.delete(collisionKey);
    }
    if (entityBGame && entityBGame.type === 'npc') {
      const collisionKey = `${collision.entityB.uuid}-${collision.entityA.uuid}`;
      activeNpcCollisions.delete(collisionKey);
    }
  });
}

// Initialize game
createWalls();
createObstacles();
createTrees();
createNPCs();
createHero();
setupCollisionHandlers();
createDebugButtons();

// Start game loop
gameLoop();

