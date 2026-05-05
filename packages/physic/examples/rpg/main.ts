import {
  PhysicsEngine,
  ProjectileSystem,
  Vector2,
  type Entity,
  type ProjectileState,
} from '../../src/index.js';

type ActorKind = 'hero' | 'slime';

interface Actor {
  id: string;
  kind: ActorKind;
  entity: Entity;
  hp: number;
  maxHp: number;
  color: string;
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

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
if (!ctx) {
  throw new Error('Canvas 2D context is unavailable');
}

const healthEl = document.getElementById('health') as HTMLElement;
const enemiesEl = document.getElementById('enemies') as HTMLElement;
const visionEl = document.getElementById('vision') as HTMLElement;
const projectilesEl = document.getElementById('projectiles') as HTMLElement;
const tickEl = document.getElementById('tick') as HTMLElement;

const world = {
  width: 1600,
  height: 1000,
};

const engine = new PhysicsEngine({
  timeStep: 1 / 60,
  gravity: new Vector2(0, 0),
  enableSleep: false,
});
const projectileSystem = new ProjectileSystem(engine);

const actors = new Map<string, Actor>();
const obstacles: Obstacle[] = [];
const keys = new Set<string>();
const mouse = new Vector2(world.width / 2, world.height / 2);
const camera = new Vector2(0, 0);

let visibleEnemies = 0;
let lastTime = performance.now();
let accumulator = 0;
let shootCooldown = 0;
let gameOver = false;

const hero = createHero();
createMap();
createEnemies();
createHeroSensor();
wireProjectileEvents();

window.addEventListener('keydown', (event) => {
  keys.add(event.key.toLowerCase());
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(event.key.toLowerCase())) {
    event.preventDefault();
  }
});

window.addEventListener('keyup', (event) => {
  keys.delete(event.key.toLowerCase());
});

canvas.addEventListener('mousemove', (event) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  mouse.set(
    camera.x + (event.clientX - rect.left) * scaleX,
    camera.y + (event.clientY - rect.top) * scaleY,
  );
});

canvas.addEventListener('pointerdown', () => {
  shoot();
});

requestAnimationFrame(loop);

function createHero(): Actor {
  const entity = engine.createCharacter('hero', {
    x: 180,
    y: 180,
    hitbox: { width: 26, height: 34 },
    speed: 185,
    linearDamping: 0.12,
  });
  const actor: Actor = {
    id: 'hero',
    kind: 'hero',
    entity,
    hp: 100,
    maxHp: 100,
    color: '#4f8cff',
    flash: 0,
  };
  actors.set(actor.id, actor);
  return actor;
}

function createEnemies(): void {
  const spawns = [
    [680, 260],
    [1000, 260],
    [1170, 620],
    [740, 760],
    [430, 560],
  ];

  spawns.forEach(([x, y], index) => {
    const id = `slime-${index}`;
    const entity = engine.createCharacter(id, {
      x,
      y,
      hitbox: 28,
      speed: 82,
      linearDamping: 0.08,
    });
    actors.set(id, {
      id,
      kind: 'slime',
      entity,
      hp: 3,
      maxHp: 3,
      color: '#d85a50',
      flash: 0,
    });
  });
}

function createMap(): void {
  addObstacle('north-wall', world.width / 2, 20, world.width, 40, '#485057');
  addObstacle('south-wall', world.width / 2, world.height - 20, world.width, 40, '#485057');
  addObstacle('west-wall', 20, world.height / 2, 40, world.height, '#485057');
  addObstacle('east-wall', world.width - 20, world.height / 2, 40, world.height, '#485057');
  addObstacle('ruin-a', 440, 260, 220, 48, '#6d6657');
  addObstacle('ruin-b', 820, 520, 260, 50, '#6d6657');
  addObstacle('pond', 1190, 405, 170, 92, '#426c7c');
  addObstacle('trees', 360, 780, 220, 54, '#52653d');
}

function addObstacle(id: string, x: number, y: number, width: number, height: number, color: string): void {
  engine.createStaticObstacle(id, { x, y, width, height });
  obstacles.push({ id, x, y, width, height, color });
}

function createHeroSensor(): void {
  engine.createSensor('hero-vision', {
    entity: hero.entity,
    radius: 260,
    onEnter: updateVisibleEnemies,
    onExit: updateVisibleEnemies,
  });
}

function updateVisibleEnemies(): void {
  const seen = engine.getZoneManager().getEntitiesInZone('hero-vision');
  visibleEnemies = seen.filter((entity) => actors.get(entity.uuid)?.kind === 'slime').length;
}

function wireProjectileEvents(): void {
  projectileSystem.onHit(({ hit }) => {
    const actor = actors.get(hit.entity.uuid);
    if (!actor || actor.kind !== 'slime') {
      return;
    }

    actor.hp -= 1;
    actor.flash = 0.18;
    if (actor.hp <= 0) {
      actors.delete(actor.id);
      engine.removeEntity(actor.entity);
      updateVisibleEnemies();
    }
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
  if (gameOver) {
    engine.moveEntity(hero.id, 'idle');
    return;
  }

  shootCooldown = Math.max(0, shootCooldown - dt);
  for (const actor of actors.values()) {
    actor.flash = Math.max(0, actor.flash - dt);
  }

  const direction = resolveInputDirection();
  engine.moveEntity(hero.id, direction);

  updateEnemies();
  if (keys.has(' ')) {
    shoot();
  }

  engine.stepFrame();
  projectileSystem.step(dt);
  updateCamera();
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

function updateEnemies(): void {
  for (const actor of actors.values()) {
    if (actor.kind !== 'slime') {
      continue;
    }

    const toHero = hero.entity.position.sub(actor.entity.position);
    const distance = toHero.length();
    if (distance < 32) {
      engine.moveEntity(actor.id, 'idle');
      damageHero(0.15);
      continue;
    }

    if (distance < 360) {
      engine.moveEntity(actor.id, toHero);
    } else {
      const wander = new Vector2(
        Math.sin(engine.getTick() * 0.018 + actor.entity.position.y * 0.01),
        Math.cos(engine.getTick() * 0.015 + actor.entity.position.x * 0.01),
      );
      engine.moveEntity(actor.id, wander, 35);
    }
  }
}

function damageHero(amount: number): void {
  hero.hp = Math.max(0, hero.hp - amount);
  hero.flash = 0.12;
  if (hero.hp <= 0) {
    gameOver = true;
  }
}

function shoot(): void {
  if (shootCooldown > 0 || gameOver) {
    return;
  }

  const origin = hero.entity.position.clone();
  const direction = mouse.sub(origin);
  if (direction.lengthSquared() === 0) {
    direction.set(1, 0);
  }

  projectileSystem.spawn({
    id: `bolt-${engine.getTick()}-${Math.floor(Math.random() * 1000)}`,
    ownerId: hero.id,
    origin,
    direction,
    speed: 520,
    range: 460,
    ttl: 0.9,
    spawnTick: engine.getTick(),
  });
  shootCooldown = 0.16;
}

function updateCamera(): void {
  const targetX = clamp(hero.entity.position.x - canvas.width / 2, 0, world.width - canvas.width);
  const targetY = clamp(hero.entity.position.y - canvas.height / 2, 0, world.height - canvas.height);
  camera.x += (targetX - camera.x) * 0.12;
  camera.y += (targetY - camera.y) * 0.12;
}

function updateHud(): void {
  healthEl.textContent = `${Math.ceil(hero.hp)}`;
  enemiesEl.textContent = `${Array.from(actors.values()).filter((actor) => actor.kind === 'slime').length}`;
  visionEl.textContent = `${visibleEnemies}`;
  projectilesEl.textContent = `${projectileSystem.getProjectiles().length}`;
  tickEl.textContent = `${engine.getTick()}`;
}

function render(): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(-Math.round(camera.x), -Math.round(camera.y));

  drawGround();
  for (const obstacle of obstacles) {
    drawObstacle(obstacle);
  }
  for (const projectile of projectileSystem.getProjectiles()) {
    drawProjectile(projectile);
  }
  for (const actor of actors.values()) {
    drawActor(actor);
  }

  ctx.restore();
  drawOverlay();
}

function drawGround(): void {
  ctx.fillStyle = '#314f38';
  ctx.fillRect(0, 0, world.width, world.height);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= world.width; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, world.height);
    ctx.stroke();
  }
  for (let y = 0; y <= world.height; y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(world.width, y);
    ctx.stroke();
  }
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

function drawActor(actor: Actor): void {
  const position = actor.entity.position;
  const radius = actor.kind === 'hero' ? 17 : 15;

  ctx.beginPath();
  ctx.arc(position.x, position.y, radius + (actor.flash > 0 ? 4 : 0), 0, Math.PI * 2);
  ctx.fillStyle = actor.flash > 0 ? '#fff0a8' : actor.color;
  ctx.fill();

  ctx.lineWidth = 3;
  ctx.strokeStyle = actor.kind === 'hero' ? '#c9dcff' : '#441f25';
  ctx.stroke();

  if (actor.kind === 'slime') {
    drawHealthBar(actor, position.x, position.y - 26, 34);
  }
}

function drawHealthBar(actor: Actor, x: number, y: number, width: number): void {
  const percent = clamp(actor.hp / actor.maxHp, 0, 1);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(x - width / 2, y, width, 5);
  ctx.fillStyle = '#f46d5e';
  ctx.fillRect(x - width / 2, y, width * percent, 5);
}

function drawProjectile(projectile: ProjectileState): void {
  ctx.beginPath();
  ctx.arc(projectile.position.x, projectile.position.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd56a';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(projectile.position.x, projectile.position.y);
  ctx.lineTo(
    projectile.position.x - projectile.direction.x * 18,
    projectile.position.y - projectile.direction.y * 18,
  );
  ctx.strokeStyle = 'rgba(255, 213, 106, 0.6)';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawOverlay(): void {
  if (!gameOver) {
    return;
  }

  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 42px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('Defeat', canvas.width / 2, canvas.height / 2);
  ctx.font = '16px system-ui';
  ctx.fillText('Refresh the page to restart', canvas.width / 2, canvas.height / 2 + 34);
  ctx.textAlign = 'start';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
