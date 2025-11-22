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
  EntityState,
  Dash,
  LinearMove,
  Knockback,
  PathFollow,
  Oscillate,
  CompositeMovement,
  SeekAvoid,
  ZoneManager,
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

// Create physics engine (deterministic, tick-based)
const engine = new PhysicsEngine({
  timeStep: 1 / 60,
  gravity: new Vector2(0, 0),
  enableSleep: false,
});
const movement = engine.getMovementManager();
const zones = engine.getZoneManager();
const fixedDeltaMs = engine.getWorld().getTimeStep() * 1000;
const fixedDeltaSeconds = engine.getWorld().getTimeStep();

// Game state
interface GameEntity {
  entity: Entity;
  type: 'hero' | 'npc' | 'wall' | 'obstacle' | 'tree';
  color: string;
  name?: string;
  debugPulse?: number;
  hitboxId?: string;
  treeSize?: number;
}

const gameEntities: GameEntity[] = [];
let hero: GameEntity | null = null;

type SimplifiedDirection = 'idle' | 'up' | 'down' | 'left' | 'right';

type PositionChangeEvent = {
  x: number;
  y: number;
};

type DirectionChangeEvent = {
  cardinalDirection: SimplifiedDirection;
  direction: Vector2;
};

type CollisionEventPayload = {
  other: Entity;
};

function registerStaticRectangle(
  id: string,
  opts: { x: number; y: number; width: number; height: number; type: GameEntity['type']; color: string; extra?: Partial<GameEntity>; },
): void {
  const centerX = opts.x + opts.width / 2;
  const centerY = opts.y + opts.height / 2;
  const entity = engine.createEntity({
    uuid: id,
    position: { x: centerX, y: centerY },
    width: opts.width,
    height: opts.height,
    mass: Infinity,
    state: EntityState.Static,
    restitution: 0, // No bounce
  });
  entity.freeze();
  gameEntities.push({
    entity,
    type: opts.type,
    color: opts.color,
    hitboxId: id,
    ...opts.extra,
  });
}

type EntityWithHooks = Entity & {
  onPositionChange(handler: (event: PositionChangeEvent) => void): () => void;
  onDirectionChange(handler: (event: DirectionChangeEvent) => void): () => void;
  onCollisionEnter(handler: (event: CollisionEventPayload) => void): () => void;
  onCollisionExit(handler: (event: CollisionEventPayload) => void): () => void;
};

const heroTelemetry = {
  moving: false,
  velocity: new Vector2(0, 0),
  direction: 'idle' as SimplifiedDirection,
  directionVector: new Vector2(0, 0),
  lastCollision: '-',
  entitiesInVisionZone: [] as Entity[],
  visionZoneId: '',
};

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

function resolveCollisionLabel(entity: Entity): string {
  const gameEntity = gameEntities.find((entry) => entry.entity.uuid === entity.uuid);
  if (!gameEntity) {
    return entity.uuid.slice(0, 4).toUpperCase();
  }
  if (gameEntity.type === 'hero') {
    return 'Hero';
  }
  if (gameEntity.name) {
    return gameEntity.name;
  }
  return gameEntity.type;
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

  registerStaticRectangle('wall-top', {
    x: 0,
    y: 0,
    width: WORLD_WIDTH,
    height: wallThickness,
    type: 'wall',
    color: '#555',
  });

  registerStaticRectangle('wall-bottom', {
    x: 0,
    y: WORLD_HEIGHT - wallThickness,
    width: WORLD_WIDTH,
    height: wallThickness,
    type: 'wall',
    color: '#555',
  });

  registerStaticRectangle('wall-left', {
    x: 0,
    y: 0,
    width: wallThickness,
    height: WORLD_HEIGHT,
    type: 'wall',
    color: '#555',
  });

  registerStaticRectangle('wall-right', {
    x: WORLD_WIDTH - wallThickness,
    y: 0,
    width: wallThickness,
    height: WORLD_HEIGHT,
    type: 'wall',
    color: '#555',
  });
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

  obstacles.forEach((obs, index) => {
    registerStaticRectangle(`obstacle-${index}`, {
      x: obs.x - obs.w / 2,
      y: obs.y - obs.h / 2,
      width: obs.w,
      height: obs.h,
      type: 'obstacle',
      color: '#666',
    });
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

  trees.forEach((tree, index) => {
    registerStaticRectangle(`tree-${index}`, {
      x: tree.x - tree.size / 2,
      y: tree.y - tree.size / 2,
      width: tree.size,
      height: tree.size,
      type: 'tree',
      color: '#8b4513',
      extra: { treeSize: tree.size },
    });
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

  npcs.forEach((npc, index) => {
    const owner = { id: `npc-${index}` };
    const entity = engine.createEntity({
      uuid: owner.id,
      position: { x: npc.x, y: npc.y },
      radius: 20,
      mass: 100,
      friction: 0.4,
      linearDamping: 0.2,
      maxLinearVelocity: 200,
      restitution: 0, // No bounce
    });
    gameEntities.push({
      entity,
      type: 'npc',
      color: '#2ecc71',
      name: npc.name,
      hitboxId: owner.id,
    });
  });
}

// Create hero
function createHero(): void {
  const heroOwner = { id: 'hero-character' };

  const heroEntity = engine.createEntity({
    uuid: heroOwner.id,
    position: { x: 300, y: 300 },
    radius: 25,
    mass: 1,
    friction: 0.4,
    linearDamping: 0.2,
    maxLinearVelocity: moveSpeed,
    restitution: 0, // No bounce
  });

  hero = {
    entity: heroEntity,
    type: 'hero',
    color: '#3498db',
    name: 'Hero',
    hitboxId: heroOwner.id,
  };
  gameEntities.push(hero);

  const heroHooks = heroEntity as EntityWithHooks;

  // Track movement state by checking velocity in position change handler
  heroHooks.onPositionChange(({ x, y }) => {
    // Update velocity from entity
    heroTelemetry.velocity = heroEntity.velocity.clone();
    const isMoving = heroEntity.velocity.lengthSquared() > 0.01;
    heroTelemetry.moving = isMoving;
  });

  heroHooks.onDirectionChange(({ cardinalDirection, direction }) => {
    heroTelemetry.direction = cardinalDirection;
    heroTelemetry.directionVector = direction.clone();
  });

  heroHooks.onCollisionEnter(({ other }) => {
    heroTelemetry.lastCollision = resolveCollisionLabel(other);
  });

  heroHooks.onCollisionExit(() => {
    heroTelemetry.lastCollision = '-';
  });

  // Tile interactions
  heroHooks.onEnterTile(({ x, y }) => {
    console.log(`Hero entered tile [${x}, ${y}]`);
  });

  // Prevent hero from entering "water" tiles (e.g., x < 5)
  heroHooks.canEnterTile(({ x, y }) => {
    if (x < 5) {
      console.log('Blocked by water!');
      return false;
    }
    return true;
  });

  // Create vision zone attached to hero
  const visionZoneId = zones.createAttachedZone(
    heroEntity,
    {
      radius: 150,
      angle: 120, // 120-degree cone
      direction: 'right',
      offset: { x: 0, y: 0 },
      limitedByWalls: true, // Uses Raycasting system to block vision through walls
    },
    {
      onEnter: (entities) => {
        // Entities entering the vision zone
        console.log('Hero sees entities:', entities.map(e => e.uuid));
      },
      onExit: (entities) => {
        // Entities leaving the vision zone
        console.log('Hero lost sight of entities:', entities.map(e => e.uuid));
      },
    },
  );
  heroTelemetry.visionZoneId = visionZoneId;
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

// Helper function to convert direction to angle
function directionToAngle(dir: SimplifiedDirection): number {
  switch (dir) {
    case 'up':
      return -Math.PI / 2;
    case 'down':
      return Math.PI / 2;
    case 'left':
      return Math.PI;
    case 'right':
      return 0;
    default:
      return 0;
  }
}

// Helper function to convert direction to zone direction
function directionToZoneDirection(dir: SimplifiedDirection): 'up' | 'down' | 'left' | 'right' {
  switch (dir) {
    case 'up':
      return 'up';
    case 'down':
      return 'down';
    case 'left':
      return 'left';
    case 'right':
      return 'right';
    default:
      return 'right';
  }
}

// Update hero movement
function updateHeroMovement(): void {
  if (!hero || !hero.hitboxId) return;

  const move = new Vector2(0, 0);

  if (keys['w'] || keys['arrowup'] || keys['z']) move.y -= 1;
  if (keys['s'] || keys['arrowdown']) move.y += 1;
  if (keys['a'] || keys['arrowleft'] || keys['q']) move.x -= 1;
  if (keys['d'] || keys['arrowright']) move.x += 1;

  if (move.length() > 0) {
    move.normalizeInPlace().mulInPlace(moveSpeed);
    hero.entity.setVelocity({ x: move.x, y: move.y });

    // Update vision zone direction based on hero movement direction
    if (heroTelemetry.visionZoneId && heroTelemetry.direction !== 'idle') {
      const zoneDirection = directionToZoneDirection(heroTelemetry.direction);
      zones.updateZone(heroTelemetry.visionZoneId, { direction: zoneDirection });
    }
  } else {
    hero.entity.setVelocity({ x: 0, y: 0 });
  }
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

  // Render vision zone
  if (hero && heroTelemetry.visionZoneId) {
    const zone = zones.getZone(heroTelemetry.visionZoneId);
    if (zone) {
      ctx.save();
      ctx.translate(zone.position.x, zone.position.y);

      // Draw zone circle/cone
      ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)';
      ctx.fillStyle = 'rgba(255, 255, 0, 0.1)';
      ctx.lineWidth = 2;

      if (zone.angle >= 360) {
        // Full circle
        ctx.beginPath();
        ctx.arc(0, 0, zone.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        // Cone
        const facing = directionToAngle(zone.direction);
        const halfAngle = (zone.angle * Math.PI) / 360;
        const startAngle = facing - halfAngle;
        const endAngle = facing + halfAngle;

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, zone.radius, startAngle, endAngle);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  // Render all entities
  gameEntities.forEach((gameEntity) => {
    const { entity, type, color } = gameEntity;

    ctx.save();
    ctx.translate(entity.position.x, entity.position.y);
    ctx.rotate(entity.rotation);

    if (type === 'tree') {
      // Draw tree (circle with brown trunk and green top)
      const treeSize = gameEntity.treeSize ?? Math.max(entity.width ?? 0, entity.height ?? 0, 40);
      const radius = treeSize / 2;

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

      // Draw velocity vector
      if (entity.velocity.length() > 1) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        const dir = entity.velocity.normalize();
        ctx.lineTo(dir.x * entity.radius * 1.2, dir.y * entity.radius * 1.2);
        ctx.stroke();
      }

      // Draw Cardinal Direction
      const cardinal = (entity as any).cardinalDirection;
      if (cardinal && cardinal !== 'idle') {
        ctx.strokeStyle = '#00ffff'; // Cyan
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        const cDir = { x: 0, y: 0 };
        if (cardinal === 'up') cDir.y = -1;
        if (cardinal === 'down') cDir.y = 1;
        if (cardinal === 'left') cDir.x = -1;
        if (cardinal === 'right') cDir.x = 1;

        ctx.lineTo(cDir.x * entity.radius * 1.5, cDir.y * entity.radius * 1.5);
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
    const speed = heroTelemetry.velocity.length();
    const directionVector = heroTelemetry.directionVector;
    const directionInfo = heroTelemetry.direction === 'idle'
      ? 'idle'
      : `${heroTelemetry.direction} (${directionVector.x.toFixed(2)}, ${directionVector.y.toFixed(2)})`;
    const collisionInfo = heroTelemetry.lastCollision === '-' ? 'none' : heroTelemetry.lastCollision;
    const visionCount = heroTelemetry.entitiesInVisionZone.length;
    const visionInfo = visionCount > 0
      ? `${visionCount} entity${visionCount > 1 ? 'ies' : ''} in vision`
      : 'no entities in vision';
    infoEl.textContent = `Position: (${Math.round(hero.entity.position.x)}, ${Math.round(hero.entity.position.y)}) | NPCs: ${npcCount} | Movement: ${heroTelemetry.moving ? 'moving' : 'idle'} | Speed: ${speed.toFixed(1)} | Direction: ${directionInfo} | Collision: ${collisionInfo} | Vision: ${visionInfo} | FPS: ${Math.round(1000 / 16.67)}`;
  }
}

// Game loop
let lastTime = performance.now();
let accumulatorMs = 0;
function gameLoop(): void {
  const currentTime = performance.now();
  const deltaMs = currentTime - lastTime;
  lastTime = currentTime;
  accumulatorMs += deltaMs;

  while (accumulatorMs >= fixedDeltaMs) {
    updateHeroMovement();
    engine.stepWithMovements();
    zones.update(); // Update zones after physics step
    // Update hero telemetry with current entities in vision zone
    if (hero && heroTelemetry.visionZoneId) {
      heroTelemetry.entitiesInVisionZone = zones.getEntitiesInZone(heroTelemetry.visionZoneId);
    }
    decayDebugPulses(fixedDeltaSeconds);
    accumulatorMs -= fixedDeltaMs;
  }

  updateCamera();
  render();
  requestAnimationFrame(gameLoop);
}

// Initialize game
createWalls();
createObstacles();
createTrees();
createNPCs();
createHero();
createDebugButtons();

// Start game loop
gameLoop();

