import {
  IceMovement,
  PhysicsEngine,
  Vector2,
  type Entity,
  type MovementHandle,
} from '../../src/index.js';

type ActorKind = 'hero' | 'path' | 'oscillate' | 'seek';
type SurfaceKind = 'normal' | 'ice';

interface Actor {
  id: string;
  kind: ActorKind;
  label: string;
  entity: Entity;
  color: string;
  radius: number;
  flash: number;
}

interface Obstacle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

interface TrailPoint {
  x: number;
  y: number;
  age: number;
}

interface SurfacePatch {
  id: string;
  kind: SurfaceKind;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const canvas = document.getElementById('game') as HTMLCanvasElement;
const context = canvas.getContext('2d');
if (!context) {
  throw new Error('Canvas 2D context is unavailable');
}
const ctx = context;

const tickEl = document.getElementById('tick') as HTMLElement;
const activeMovesEl = document.getElementById('activeMoves') as HTMLElement;
const dashEl = document.getElementById('dash') as HTMLElement;
const repulsesEl = document.getElementById('repulses') as HTMLElement;
const surfaceEl = document.getElementById('surface') as HTMLElement;

const world = {
  width: 960,
  height: 600,
};

const engine = new PhysicsEngine({
  timeStep: 1 / 60,
  gravity: new Vector2(0, 0),
  enableSleep: false,
  spatialCellSize: 64,
  spatialGridWidth: 32,
  spatialGridHeight: 24,
});
const movement = engine.getMovementManager();

const actors = new Map<string, Actor>();
const obstacles: Obstacle[] = [];
const keys = new Set<string>();
const heroTrail: TrailPoint[] = [];
const knockbackHandles = new Map<string, MovementHandle>();
const icePatch: SurfacePatch = {
  id: 'ice-floor',
  kind: 'ice',
  label: 'Ice',
  x: 160,
  y: 492,
  width: 230,
  height: 92,
};
const guardPath = [
  { x: 180, y: 135 },
  { x: 780, y: 135 },
  { x: 780, y: 465 },
  { x: 180, y: 465 },
];

let lastTime = performance.now();
let accumulator = 0;
let dashCooldown = 0;
let knockbackCooldown = 0;
let dashHandle: MovementHandle | null = null;
let guardHandle: MovementHandle | null = null;
let heroIceHandle: MovementHandle | null = null;
let repulseCount = 0;
let heroSurface: SurfaceKind = 'normal';
let lastInputDirection = new Vector2(1, 0);

const hero = createActor('hero', 'hero', 'Hero', 110, 300, '#5aa7ff', 16, 165, 1.35);
createMap();
createPresetActors();
wireInput();
resetGuardPath();

requestAnimationFrame(loop);

function createActor(
  id: string,
  kind: ActorKind,
  label: string,
  x: number,
  y: number,
  color: string,
  radius: number,
  speed: number,
  mass = 1,
): Actor {
  const entity = engine.createCharacter(id, {
    x,
    y,
    hitbox: radius,
    speed,
    mass,
    maxLinearVelocity: Math.max(speed, 420),
    linearDamping: 0.08,
  });
  const actor: Actor = {
    id,
    kind,
    label,
    entity,
    color,
    radius,
    flash: 0,
  };
  actors.set(id, actor);
  return actor;
}

function createPresetActors(): void {
  const orb = createActor('orb', 'oscillate', 'Oscillate', 480, 300, '#8ee36f', 14, 0);
  movement.oscillate(orb.entity, {
    direction: { x: 1, y: 0 },
    amplitude: 70,
    period: 2.6,
  });

  const chaser = createActor('chaser', 'seek', 'SeekAvoid', 820, 300, '#ff6f7f', 15, 0);
  movement.seekAvoid(chaser.entity, {
    target: hero.entity,
    maxSpeed: 95,
    repulseRadius: 80,
    repulseWeight: 120,
  });

  createActor('guard', 'path', 'PathFollow', guardPath[0]!.x, guardPath[0]!.y, '#ffcd69', 15, 0);
}

function createMap(): void {
  addObstacle('north-wall', world.width / 2, 18, world.width, 36, '#47515a');
  addObstacle('south-wall', world.width / 2, world.height - 18, world.width, 36, '#47515a');
  addObstacle('west-wall', 18, world.height / 2, 36, world.height, '#47515a');
  addObstacle('east-wall', world.width - 18, world.height / 2, 36, world.height, '#47515a');
  addObstacle('center-a', 480, 220, 180, 34, '#606a71');
  addObstacle('center-b', 480, 380, 180, 34, '#606a71');
  addObstacle('left-block', 280, 300, 42, 170, '#56656f');
  addObstacle('right-block', 680, 300, 42, 170, '#56656f');
}

function addObstacle(id: string, x: number, y: number, width: number, height: number, color: string): void {
  engine.createStaticObstacle(id, { x, y, width, height });
  obstacles.push({ id, x, y, width, height, color });
}

function wireInput(): void {
  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'shift'].includes(key)) {
      event.preventDefault();
    }
    keys.add(key);
    if (event.repeat && [' ', 'shift', '1'].includes(key)) {
      return;
    }
    if (key === 'shift') {
      dash();
    }
    if (key === ' ') {
      knockbackNearby();
    }
    if (key === '1') {
      resetGuardPath();
    }
  });

  window.addEventListener('keyup', (event) => {
    keys.delete(event.key.toLowerCase());
  });
}

function resetGuardPath(): void {
  startGuardPath(true);
}

function startGuardPath(resetPosition: boolean): void {
  guardHandle?.cancel();
  const guard = actors.get('guard');
  if (!guard) {
    return;
  }
  if (resetPosition) {
    engine.teleport(guard.entity, guardPath[0]!);
  }
  guardHandle = movement.followPath(guard.entity, {
    waypoints: guardPath,
    speed: 105,
    loop: true,
    pauseAtWaypoints: 0.25,
    tolerance: 18,
  });
}

function loop(time: number): void {
  const frameTime = Math.min(0.05, (time - lastTime) / 1000);
  lastTime = time;
  accumulator += frameTime;

  while (accumulator >= 1 / 60) {
    update(1 / 60);
    accumulator -= 1 / 60;
  }

  render();
  requestAnimationFrame(loop);
}

function update(dt: number): void {
  dashCooldown = Math.max(0, dashCooldown - dt);
  knockbackCooldown = Math.max(0, knockbackCooldown - dt);
  for (const actor of actors.values()) {
    actor.flash = Math.max(0, actor.flash - dt);
  }
  for (const point of heroTrail) {
    point.age += dt;
  }
  while (heroTrail.length > 0 && heroTrail[0]!.age > 0.22) {
    heroTrail.shift();
  }

  updateHeroMovement();

  engine.stepWithMovements(dt);
  updateTouchFeedback();
  updateHud();
}

function resolveInputDirection(): Vector2 {
  let x = 0;
  let y = 0;
  if (keys.has('a') || keys.has('q') || keys.has('arrowleft')) x -= 1;
  if (keys.has('d') || keys.has('arrowright')) x += 1;
  if (keys.has('w') || keys.has('z') || keys.has('arrowup')) y -= 1;
  if (keys.has('s') || keys.has('arrowdown')) y += 1;
  return new Vector2(x, y);
}

function updateHeroMovement(): void {
  const inputDirection = resolveInputDirection();
  const hasInput = inputDirection.lengthSquared() > 0;

  if (hasInput) {
    lastInputDirection = inputDirection.normalize();
  }

  heroSurface = isActorOnSurface(hero, icePatch) ? 'ice' : 'normal';
  if (heroSurface === 'ice') {
    updateHeroIceMovement(inputDirection);
    return;
  }

  stopHeroIceMovement();
  if (!dashHandle?.isActive()) {
    engine.moveEntity(hero.entity, inputDirection);
  }
}

function updateHeroIceMovement(inputDirection: Vector2): void {
  const hasInput = inputDirection.lengthSquared() > 0;
  const hasVelocity = hero.entity.velocity.lengthSquared() > 4;

  if (!heroIceHandle?.isActive() && !hasInput && !hasVelocity) {
    return;
  }

  const strategy = getOrStartHeroIceMovement(inputDirection);
  if (!strategy) {
    return;
  }

  if (hasInput) {
    strategy.setTargetDirection(inputDirection);
  } else {
    strategy.stop();
  }
}

function getOrStartHeroIceMovement(inputDirection: Vector2): IceMovement | null {
  const activeStrategy = getHeroIceStrategy();
  if (activeStrategy) {
    return activeStrategy;
  }

  const direction = resolveIceDirection(inputDirection);
  heroIceHandle = movement.ice(hero.entity, {
    direction,
    maxSpeed: 190,
    acceleration: accelerationForMass(hero.entity.mass),
    friction: frictionForMass(hero.entity.mass),
    initialVelocity: hero.entity.velocity,
    replace: false,
  });
  hero.flash = Math.max(hero.flash, 0.08);

  return getHeroIceStrategy();
}

function getHeroIceStrategy(): IceMovement | null {
  if (!heroIceHandle?.isActive() || !(heroIceHandle.strategy instanceof IceMovement)) {
    return null;
  }
  return heroIceHandle.strategy;
}

function stopHeroIceMovement(): void {
  if (heroIceHandle?.isActive()) {
    heroIceHandle.cancel();
    heroIceHandle = null;
  }
}

function resolveIceDirection(inputDirection: Vector2): { x: number; y: number } {
  if (inputDirection.lengthSquared() > 0) {
    return inputDirection.normalize();
  }
  if (hero.entity.velocity.lengthSquared() > 0) {
    return hero.entity.velocity.normalize();
  }
  return lastInputDirection;
}

function accelerationForMass(mass: number): number {
  return clamp(0.55 / Math.max(0.1, mass), 0.12, 0.55);
}

function frictionForMass(mass: number): number {
  return clamp(0.16 / Math.max(0.1, mass), 0.04, 0.16);
}

function dash(): void {
  if (dashCooldown > 0 || dashHandle?.isActive()) {
    return;
  }

  heroTrail.push({ x: hero.entity.position.x, y: hero.entity.position.y, age: 0 });
  dashHandle = movement.dash(hero.entity, {
    speed: 360,
    direction: lastInputDirection,
    duration: 0.16,
    replace: false,
    onComplete: () => {
      engine.moveEntity(hero.entity, 'idle');
    },
  });
  dashCooldown = 0.55;
}

function knockbackNearby(): void {
  if (knockbackCooldown > 0) {
    return;
  }
  knockbackCooldown = 0.22;

  for (const actor of actors.values()) {
    if (actor.kind === 'hero') {
      continue;
    }
    if (knockbackHandles.get(actor.id)?.isActive()) {
      continue;
    }
    const delta = actor.entity.position.sub(hero.entity.position);
    const distance = delta.length();
    if (distance > 115) {
      continue;
    }
    const direction = distance > 0 ? delta.div(distance) : new Vector2(1, 0);
    const handle = movement.knockback(actor.entity, {
      direction,
      speed: 245,
      duration: 0.28,
      replace: true,
    });
    knockbackHandles.set(actor.id, handle);
    handle.finished.then(() => {
      knockbackHandles.delete(actor.id);
      restartPreset(actor);
    });
    actor.flash = 0.2;
    repulseCount += 1;
  }
}

function restartPreset(actor: Actor): void {
  switch (actor.kind) {
    case 'path':
      startGuardPath(false);
      break;
    case 'oscillate':
      movement.oscillate(actor.entity, {
        direction: { x: 1, y: 0 },
        amplitude: 70,
        period: 2.6,
      });
      break;
    case 'seek':
      movement.seekAvoid(actor.entity, {
        target: hero.entity,
        maxSpeed: 95,
        repulseRadius: 80,
        repulseWeight: 120,
      });
      break;
    case 'hero':
      break;
  }
}

function isActorOnSurface(actor: Actor, patch: SurfacePatch): boolean {
  const left = patch.x - patch.width / 2;
  const right = patch.x + patch.width / 2;
  const top = patch.y - patch.height / 2;
  const bottom = patch.y + patch.height / 2;
  const nearestX = clamp(actor.entity.position.x, left, right);
  const nearestY = clamp(actor.entity.position.y, top, bottom);
  const dx = actor.entity.position.x - nearestX;
  const dy = actor.entity.position.y - nearestY;
  return dx * dx + dy * dy <= actor.radius * actor.radius;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function updateTouchFeedback(): void {
  for (const actor of actors.values()) {
    if (actor.kind === 'hero') {
      continue;
    }
    const distance = actor.entity.position.distanceTo(hero.entity.position);
    if (distance < actor.radius + hero.radius + 3) {
      actor.flash = Math.max(actor.flash, 0.08);
      hero.flash = Math.max(hero.flash, 0.08);
    }
  }
}

function updateHud(): void {
  const activeMoves = Array.from(actors.values()).reduce((total, actor) => total + movement.count(actor.entity), 0);
  tickEl.textContent = `${engine.getTick()}`;
  activeMovesEl.textContent = `${activeMoves}`;
  dashEl.textContent = dashCooldown <= 0 ? 'ready' : `${dashCooldown.toFixed(1)}s`;
  repulsesEl.textContent = `${repulseCount}`;
  surfaceEl.textContent = heroSurface === 'ice' ? `ice (mass ${hero.entity.mass})` : 'normal';
}

function render(): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGround();
  drawIcePatch();
  drawGuardPath();
  for (const obstacle of obstacles) {
    drawObstacle(obstacle);
  }
  for (const point of heroTrail) {
    drawTrail(point);
  }
  for (const actor of actors.values()) {
    drawActor(actor);
  }
  drawKnockbackRange();
}

function drawGround(): void {
  ctx.fillStyle = '#293841';
  ctx.fillRect(0, 0, world.width, world.height);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= world.width; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, world.height);
    ctx.stroke();
  }
  for (let y = 0; y <= world.height; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(world.width, y);
    ctx.stroke();
  }
}

function drawGuardPath(): void {
  ctx.strokeStyle = 'rgba(255, 205, 105, 0.45)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  guardPath.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);

  for (const point of guardPath) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffcd69';
    ctx.fill();
  }
}

function drawIcePatch(): void {
  const left = icePatch.x - icePatch.width / 2;
  const top = icePatch.y - icePatch.height / 2;

  ctx.fillStyle = 'rgba(118, 225, 255, 0.18)';
  ctx.fillRect(left, top, icePatch.width, icePatch.height);
  ctx.strokeStyle = heroSurface === 'ice' ? '#d6f8ff' : 'rgba(118, 225, 255, 0.7)';
  ctx.lineWidth = heroSurface === 'ice' ? 3 : 2;
  ctx.strokeRect(left, top, icePatch.width, icePatch.height);

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, icePatch.width, icePatch.height);
  ctx.clip();
  ctx.strokeStyle = 'rgba(214, 248, 255, 0.22)';
  ctx.lineWidth = 2;
  for (let x = left - icePatch.height; x < left + icePatch.width; x += 22) {
    ctx.beginPath();
    ctx.moveTo(x, top + icePatch.height);
    ctx.lineTo(x + icePatch.height, top);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = '#d6f8ff';
  ctx.font = '700 12px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(icePatch.label, icePatch.x, top + 22);
  ctx.textAlign = 'start';
}

function drawObstacle(obstacle: Obstacle): void {
  ctx.fillStyle = obstacle.color;
  ctx.fillRect(
    obstacle.x - obstacle.width / 2,
    obstacle.y - obstacle.height / 2,
    obstacle.width,
    obstacle.height,
  );
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.strokeRect(
    obstacle.x - obstacle.width / 2,
    obstacle.y - obstacle.height / 2,
    obstacle.width,
    obstacle.height,
  );
}

function drawTrail(point: TrailPoint): void {
  const alpha = Math.max(0, 1 - point.age / 0.22);
  ctx.beginPath();
  ctx.arc(point.x, point.y, 22 * alpha, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(90, 167, 255, ${0.22 * alpha})`;
  ctx.fill();
}

function drawActor(actor: Actor): void {
  const position = actor.entity.position;
  const radius = actor.radius + (actor.flash > 0 ? 4 : 0);

  ctx.beginPath();
  ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = actor.flash > 0 ? '#fff0a8' : actor.color;
  ctx.fill();

  ctx.lineWidth = 3;
  ctx.strokeStyle = actor.kind === 'hero' ? '#d6e8ff' : 'rgba(0, 0, 0, 0.48)';
  ctx.stroke();

  ctx.fillStyle = '#eef1f3';
  ctx.font = '600 12px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(actor.label, position.x, position.y - actor.radius - 12);
  ctx.textAlign = 'start';
}

function drawKnockbackRange(): void {
  if (!keys.has(' ')) {
    return;
  }
  ctx.beginPath();
  ctx.arc(hero.entity.position.x, hero.entity.position.y, 115, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = 2;
  ctx.stroke();
}
