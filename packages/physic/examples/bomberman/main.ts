import {
  PhysicsEngine,
  Vector2,
  type Entity,
} from '../../src/index.js';

type TileKind = 'floor' | 'wall' | 'block';
type BombOwner = 'player' | 'enemy';
type Direction = { dc: number; dr: number };
type TilePosition = { col: number; row: number };

interface Bomb {
  id: string;
  owner: BombOwner;
  col: number;
  row: number;
  timer: number;
  entity: Entity | null;
}

interface Flame {
  col: number;
  row: number;
  ttl: number;
}

interface Enemy {
  id: string;
  entity: Entity;
  direction: Direction;
  escapePath: TilePosition[];
  alive: boolean;
}

const canvas = document.getElementById('game') as HTMLCanvasElement;
const context = canvas.getContext('2d');
if (!context) {
  throw new Error('Canvas 2D context is unavailable');
}
const ctx = context;

const statusEl = document.getElementById('status') as HTMLElement;
const bombsEl = document.getElementById('bombs') as HTMLElement;
const enemiesEl = document.getElementById('enemies') as HTMLElement;
const blocksEl = document.getElementById('blocks') as HTMLElement;
const tickEl = document.getElementById('tick') as HTMLElement;

const COLS = 15;
const ROWS = 13;
const TILE = 40;
const BOMB_TIMER = 1.8;
const FLAME_TTL = 0.42;
const FLAME_RANGE = 3;
const PLAYER_SPEED = 150;
const ENEMY_SPEED = 82;
const ENEMY_BOMB_COOLDOWN = 3.2;
const directions: Direction[] = [
  { dc: 1, dr: 0 },
  { dc: -1, dr: 0 },
  { dc: 0, dr: 1 },
  { dc: 0, dr: -1 },
];

const engine = new PhysicsEngine({
  timeStep: 1 / 60,
  gravity: new Vector2(0, 0),
  enableSleep: false,
  spatialCellSize: TILE,
  spatialGridWidth: COLS,
  spatialGridHeight: ROWS,
});

let tiles: TileKind[][] = [];
let destructibleBlocks = new Map<string, Entity>();
let bombs = new Map<string, Bomb>();
let flames: Flame[] = [];
let keys = new Set<string>();
let player = createPlayer();
let enemy: Enemy | null = null;
let gameOver = false;
let lastTime = performance.now();
let accumulator = 0;
let bombSequence = 0;
let enemyBombCooldown = 0;

resetGame();
wireInput();
requestAnimationFrame(loop);

function resetGame(): void {
  engine.clear();
  tiles = createTiles();
  destructibleBlocks = new Map();
  bombs = new Map();
  flames = [];
  bombSequence = 0;
  enemyBombCooldown = 1.2;
  gameOver = false;
  createPhysicsMap();
  player = createPlayer();
  enemy = createEnemy();
  updateHud();
}

function createPlayer(): Entity {
  return engine.createCharacter('player', {
    x: tileCenter(1),
    y: tileCenter(1),
    hitbox: { width: 24, height: 24 },
    speed: PLAYER_SPEED,
    linearDamping: 0.08,
  });
}

function createEnemy(): Enemy {
  const entity = engine.createCharacter('enemy-1', {
    x: tileCenter(COLS - 2),
    y: tileCenter(ROWS - 2),
    hitbox: { width: 24, height: 24 },
    speed: ENEMY_SPEED,
    linearDamping: 0.05,
  });

  return {
    id: 'enemy-1',
    entity,
    direction: { dc: -1, dr: 0 },
    escapePath: [],
    alive: true,
  };
}

function createTiles(): TileKind[][] {
  const nextTiles: TileKind[][] = [];
  for (let row = 0; row < ROWS; row += 1) {
    const line: TileKind[] = [];
    for (let col = 0; col < COLS; col += 1) {
      if (isBorder(col, row) || (col % 2 === 0 && row % 2 === 0)) {
        line.push('wall');
      } else if (isProtectedSpawn(col, row) || isEnemySpawnArea(col, row)) {
        line.push('floor');
      } else if ((col * 7 + row * 11) % 5 !== 0) {
        line.push('block');
      } else {
        line.push('floor');
      }
    }
    nextTiles.push(line);
  }
  return nextTiles;
}

function createPhysicsMap(): void {
  forEachTile((col, row, kind) => {
    if (kind === 'wall') {
      engine.createStaticObstacle(tileId('wall', col, row), {
        x: tileCenter(col),
        y: tileCenter(row),
        width: TILE,
        height: TILE,
      });
      return;
    }

    if (kind === 'block') {
      const entity = engine.createStaticObstacle(tileId('block', col, row), {
        x: tileCenter(col),
        y: tileCenter(row),
        width: TILE - 4,
        height: TILE - 4,
      });
      destructibleBlocks.set(tileKey(col, row), entity);
    }
  });
}

function wireInput(): void {
  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'r'].includes(key)) {
      event.preventDefault();
    }
    keys.add(key);
    if (event.repeat) {
      return;
    }
    if (key === ' ') {
      placePlayerBomb();
    }
    if (key === 'r' && gameOver) {
      resetGame();
    }
  });

  window.addEventListener('keyup', (event) => {
    keys.delete(event.key.toLowerCase());
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
  updateBombs(dt);
  updateFlames(dt);
  enemyBombCooldown = Math.max(0, enemyBombCooldown - dt);
  updateEnemy();

  if (gameOver) {
    engine.moveEntity(player, 'idle');
  } else {
    engine.moveEntity(player, resolveInputDirection());
  }

  armBombsAfterOwnersLeave();
  engine.stepFrame();
  damagePlayerInFlames();
  damageEnemyInFlames();
  damagePlayerOnEnemyTouch();
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

function placePlayerBomb(): void {
  if (gameOver) {
    return;
  }

  const tile = worldToTile(player.position.x, player.position.y);
  placeBombAt('player', tile.col, tile.row);
}

function placeEnemyBomb(col: number, row: number): boolean {
  if (!enemy?.alive || gameOver || enemyBombCooldown > 0) {
    return false;
  }

  if (!shouldEnemyPlaceBomb(col, row)) {
    return false;
  }

  const escapePath = findEnemyEscapePath(col, row, [{ col, row }]);
  if (!escapePath) {
    return false;
  }

  if (placeBombAt('enemy', col, row)) {
    enemy.escapePath = escapePath;
    enemyBombCooldown = ENEMY_BOMB_COOLDOWN;
    return true;
  }

  return false;
}

function placeBombAt(owner: BombOwner, col: number, row: number): boolean {
  const tile = { col, row };
  if (!isInside(tile.col, tile.row) || tileAt(tile.col, tile.row) !== 'floor') {
    return false;
  }

  const key = tileKey(tile.col, tile.row);
  if (bombs.has(key)) {
    return false;
  }

  bombSequence += 1;
  bombs.set(key, {
    id: `bomb-${bombSequence}`,
    owner,
    col: tile.col,
    row: tile.row,
    timer: BOMB_TIMER,
    entity: null,
  });
  return true;
}

function armBombsAfterOwnersLeave(): void {
  for (const bomb of bombs.values()) {
    if (bomb.entity) {
      continue;
    }

    const ownerEntity = getBombOwnerEntity(bomb);
    const ownerTile = ownerEntity ? worldToTile(ownerEntity.position.x, ownerEntity.position.y) : null;
    if (ownerTile && ownerTile.col === bomb.col && ownerTile.row === bomb.row) {
      continue;
    }

    bomb.entity = engine.createStaticObstacle(bomb.id, {
      x: tileCenter(bomb.col),
      y: tileCenter(bomb.row),
      width: TILE - 10,
      height: TILE - 10,
    });
  }
}

function getBombOwnerEntity(bomb: Bomb): Entity | null {
  if (bomb.owner === 'player') {
    return player;
  }
  return enemy?.alive ? enemy.entity : null;
}

function updateBombs(dt: number): void {
  const exploding: Bomb[] = [];
  for (const bomb of bombs.values()) {
    bomb.timer -= dt;
    if (bomb.timer <= 0) {
      exploding.push(bomb);
    }
  }

  for (const bomb of exploding) {
    explodeBomb(bomb);
  }
}

function explodeBomb(bomb: Bomb): void {
  bombs.delete(tileKey(bomb.col, bomb.row));
  if (bomb.entity) {
    engine.removeEntity(bomb.entity);
  }

  const createdFlames: Flame[] = [
    { col: bomb.col, row: bomb.row, ttl: FLAME_TTL },
  ];

  for (const direction of directions) {
    for (let distance = 1; distance <= FLAME_RANGE; distance += 1) {
      const col = bomb.col + direction.dc * distance;
      const row = bomb.row + direction.dr * distance;
      if (!isInside(col, row) || tileAt(col, row) === 'wall') {
        break;
      }

      createdFlames.push({ col, row, ttl: FLAME_TTL });

      if (tileAt(col, row) === 'block') {
        destroyBlock(col, row);
        break;
      }
    }
  }

  flames.push(...createdFlames);
  damagePlayerInFlames();
}

function destroyBlock(col: number, row: number): void {
  const key = tileKey(col, row);
  const block = destructibleBlocks.get(key);
  if (!block) {
    return;
  }

  engine.removeEntity(block);
  destructibleBlocks.delete(key);
  setTile(col, row, 'floor');
}

function updateFlames(dt: number): void {
  for (const flame of flames) {
    flame.ttl -= dt;
  }
  flames = flames.filter((flame) => flame.ttl > 0);
}

function damagePlayerInFlames(): void {
  if (gameOver) {
    return;
  }

  const playerTile = worldToTile(player.position.x, player.position.y);
  const isHit = flames.some((flame) => flame.col === playerTile.col && flame.row === playerTile.row);
  if (isHit) {
    gameOver = true;
    engine.moveEntity(player, 'idle');
  }
}

function damageEnemyInFlames(): void {
  if (!enemy?.alive) {
    return;
  }

  const enemyTile = worldToTile(enemy.entity.position.x, enemy.entity.position.y);
  const isHit = flames.some((flame) => flame.col === enemyTile.col && flame.row === enemyTile.row);
  if (!isHit) {
    return;
  }

  enemy.alive = false;
  engine.removeEntity(enemy.entity);
  enemy = null;
}

function damagePlayerOnEnemyTouch(): void {
  if (gameOver || !enemy?.alive) {
    return;
  }

  if (player.position.distanceTo(enemy.entity.position) < 24) {
    gameOver = true;
    engine.moveEntity(player, 'idle');
  }
}

function updateEnemy(): void {
  if (!enemy?.alive || gameOver) {
    if (enemy?.alive) {
      engine.moveEntity(enemy.entity, 'idle');
    }
    return;
  }

  const enemyTile = worldToTile(enemy.entity.position.x, enemy.entity.position.y);
  if (isNearTileCenter(enemy.entity)) {
    const escapeDirection = chooseEnemyEscapeDirection(enemyTile.col, enemyTile.row);
    if (escapeDirection) {
      enemy.direction = escapeDirection;
    } else if (isTileThreatened(enemyTile.col, enemyTile.row)) {
      const escapePath = findEnemyEscapePath(enemyTile.col, enemyTile.row);
      enemy.escapePath = escapePath ?? [];
      enemy.direction = chooseEnemyEscapeDirection(enemyTile.col, enemyTile.row) ?? { dc: 0, dr: 0 };
    } else if (placeEnemyBomb(enemyTile.col, enemyTile.row)) {
      enemy.direction = chooseEnemyEscapeDirection(enemyTile.col, enemyTile.row) ?? enemy.direction;
    } else {
      enemy.direction = chooseEnemyDirection(enemyTile.col, enemyTile.row, enemy.direction);
    }
  }

  engine.moveEntity(enemy.entity, {
    x: enemy.direction.dc,
    y: enemy.direction.dr,
  }, ENEMY_SPEED);
}

function chooseEnemyDirection(col: number, row: number, current: Direction): Direction {
  const available = directions.filter((direction) => {
    const nextCol = col + direction.dc;
    const nextRow = row + direction.dr;
    return canEnemyEnter(nextCol, nextRow) && !isTileThreatened(nextCol, nextRow);
  });
  if (available.length === 0) {
    return { dc: 0, dr: 0 };
  }

  const forward = available.find((direction) => sameDirection(direction, current));
  if (forward && available.length < 3) {
    return forward;
  }

  const reverse = { dc: -current.dc, dr: -current.dr };
  const choices = available.filter((direction) => !sameDirection(direction, reverse));
  const candidates = choices.length > 0 ? choices : available;
  const index = Math.abs(col * 17 + row * 31 + engine.getTick()) % candidates.length;
  return candidates[index] ?? candidates[0] ?? current;
}

function canEnemyEnter(col: number, row: number): boolean {
  return isInside(col, row)
    && tileAt(col, row) === 'floor'
    && !bombs.has(tileKey(col, row))
    && !flames.some((flame) => flame.col === col && flame.row === row);
}

function shouldEnemyPlaceBomb(col: number, row: number): boolean {
  if (bombs.has(tileKey(col, row))) {
    return false;
  }

  if (isTileThreatened(col, row)) {
    return false;
  }

  const playerTile = worldToTile(player.position.x, player.position.y);
  const playerInBlastLane = isInClearBlastLane(col, row, playerTile.col, playerTile.row);
  if (playerInBlastLane) {
    return true;
  }

  return countBreakableBlocksInBlast(col, row) > 0;
}

function chooseEnemyEscapeDirection(col: number, row: number): Direction | null {
  if (!enemy?.alive) {
    return null;
  }

  while (enemy.escapePath.length > 0) {
    const next = enemy.escapePath[0];
    if (!next) {
      return null;
    }
    if (next.col !== col || next.row !== row) {
      if (!canEnemyEnter(next.col, next.row)) {
        enemy.escapePath = [];
        return null;
      }
      return {
        dc: Math.sign(next.col - col),
        dr: Math.sign(next.row - row),
      };
    }
    enemy.escapePath.shift();
  }

  return null;
}

function findEnemyEscapePath(startCol: number, startRow: number, extraBombs: TilePosition[] = []): TilePosition[] | null {
  const queue: Array<{ col: number; row: number; depth: number; path: TilePosition[] }> = [];
  const visited = new Set<string>([tileKey(startCol, startRow)]);
  const maxDepth = FLAME_RANGE + 3;

  for (const direction of directions) {
    const nextCol = startCol + direction.dc;
    const nextRow = startRow + direction.dr;
    if (!canEnemyEnter(nextCol, nextRow) || hasExtraBombAt(nextCol, nextRow, extraBombs)) {
      continue;
    }
    queue.push({
      col: nextCol,
      row: nextRow,
      depth: 1,
      path: [{ col: nextCol, row: nextRow }],
    });
    visited.add(tileKey(nextCol, nextRow));
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    if (!isTileThreatened(current.col, current.row, extraBombs)) {
      return current.path;
    }

    if (current.depth >= maxDepth) {
      continue;
    }

    for (const direction of directions) {
      const nextCol = current.col + direction.dc;
      const nextRow = current.row + direction.dr;
      const key = tileKey(nextCol, nextRow);
      if (visited.has(key) || !canEnemyEnter(nextCol, nextRow) || hasExtraBombAt(nextCol, nextRow, extraBombs)) {
        continue;
      }
      visited.add(key);
      queue.push({
        col: nextCol,
        row: nextRow,
        depth: current.depth + 1,
        path: [...current.path, { col: nextCol, row: nextRow }],
      });
    }
  }

  return null;
}

function hasExtraBombAt(col: number, row: number, extraBombs: TilePosition[]): boolean {
  return extraBombs.some((bomb) => bomb.col === col && bomb.row === row);
}

function isTileThreatened(col: number, row: number, extraBombs: TilePosition[] = []): boolean {
  if (flames.some((flame) => flame.col === col && flame.row === row)) {
    return true;
  }

  for (const bomb of bombs.values()) {
    if (isInBombBlast(bomb.col, bomb.row, col, row)) {
      return true;
    }
  }

  return extraBombs.some((bomb) => isInBombBlast(bomb.col, bomb.row, col, row));
}

function countBreakableBlocksInBlast(sourceCol: number, sourceRow: number): number {
  let blocks = 0;
  for (const direction of directions) {
    for (let distance = 1; distance <= FLAME_RANGE; distance += 1) {
      const col = sourceCol + direction.dc * distance;
      const row = sourceRow + direction.dr * distance;
      const kind = tileAt(col, row);
      if (kind === 'wall') {
        break;
      }
      if (kind === 'block') {
        blocks += 1;
        break;
      }
      if (bombs.has(tileKey(col, row))) {
        break;
      }
    }
  }
  return blocks;
}

function isInClearBlastLane(sourceCol: number, sourceRow: number, targetCol: number, targetRow: number): boolean {
  if (sourceCol !== targetCol && sourceRow !== targetRow) {
    return false;
  }

  const colDelta = Math.sign(targetCol - sourceCol);
  const rowDelta = Math.sign(targetRow - sourceRow);
  const distance = Math.abs(targetCol - sourceCol) + Math.abs(targetRow - sourceRow);
  if (distance === 0 || distance > FLAME_RANGE) {
    return false;
  }

  for (let step = 1; step <= distance; step += 1) {
    const col = sourceCol + colDelta * step;
    const row = sourceRow + rowDelta * step;
    if (tileAt(col, row) !== 'floor' || bombs.has(tileKey(col, row))) {
      return false;
    }
  }

  return true;
}

function isInBombBlast(sourceCol: number, sourceRow: number, targetCol: number, targetRow: number): boolean {
  if (sourceCol === targetCol && sourceRow === targetRow) {
    return true;
  }
  if (sourceCol !== targetCol && sourceRow !== targetRow) {
    return false;
  }

  const colDelta = Math.sign(targetCol - sourceCol);
  const rowDelta = Math.sign(targetRow - sourceRow);
  const distance = Math.abs(targetCol - sourceCol) + Math.abs(targetRow - sourceRow);
  if (distance > FLAME_RANGE) {
    return false;
  }

  for (let step = 1; step <= distance; step += 1) {
    const col = sourceCol + colDelta * step;
    const row = sourceRow + rowDelta * step;
    const kind = tileAt(col, row);
    if (kind === 'wall') {
      return false;
    }
    if (kind === 'block' && step < distance) {
      return false;
    }
  }

  return true;
}

function sameDirection(a: Direction, b: Direction): boolean {
  return a.dc === b.dc && a.dr === b.dr;
}

function isNearTileCenter(entity: Entity): boolean {
  const tile = worldToTile(entity.position.x, entity.position.y);
  return Math.abs(entity.position.x - tileCenter(tile.col)) < 3
    && Math.abs(entity.position.y - tileCenter(tile.row)) < 3;
}

function updateHud(): void {
  statusEl.textContent = gameOver ? 'defeated' : 'alive';
  bombsEl.textContent = `${bombs.size}`;
  enemiesEl.textContent = enemy?.alive ? '1' : '0';
  blocksEl.textContent = `${destructibleBlocks.size}`;
  tickEl.textContent = `${engine.getTick()}`;
}

function render(): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawFloor();
  drawTiles();
  drawBombs();
  drawFlames();
  drawEnemy();
  drawPlayer();
}

function drawFloor(): void {
  ctx.fillStyle = '#263b35';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.055)';
  ctx.lineWidth = 1;
  for (let col = 0; col <= COLS; col += 1) {
    ctx.beginPath();
    ctx.moveTo(col * TILE, 0);
    ctx.lineTo(col * TILE, canvas.height);
    ctx.stroke();
  }
  for (let row = 0; row <= ROWS; row += 1) {
    ctx.beginPath();
    ctx.moveTo(0, row * TILE);
    ctx.lineTo(canvas.width, row * TILE);
    ctx.stroke();
  }
}

function drawTiles(): void {
  forEachTile((col, row, kind) => {
    if (kind === 'floor') {
      return;
    }

    const x = col * TILE;
    const y = row * TILE;
    if (kind === 'wall') {
      ctx.fillStyle = '#4b5960';
      ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.fillRect(x + 7, y + 7, TILE - 14, 5);
      return;
    }

    ctx.fillStyle = '#9b7248';
    ctx.fillRect(x + 5, y + 5, TILE - 10, TILE - 10);
    ctx.strokeStyle = 'rgba(55, 36, 21, 0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 8, y + 8, TILE - 16, TILE - 16);
  });
}

function drawBombs(): void {
  for (const bomb of bombs.values()) {
    const x = tileCenter(bomb.col);
    const y = tileCenter(bomb.row);
    const pulse = 1 + Math.sin(performance.now() / 90) * 0.06;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = '#1a1e22';
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f3cf6e';
    ctx.fillRect(3, -18, 9, 5);
    ctx.fillStyle = bomb.timer < 0.45 ? '#ff7568' : bomb.owner === 'enemy' ? '#e05d5d' : '#ffffff';
    ctx.beginPath();
    ctx.arc(-4, -5, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawFlames(): void {
  for (const flame of flames) {
    const alpha = Math.max(0, Math.min(1, flame.ttl / FLAME_TTL));
    const x = flame.col * TILE;
    const y = flame.row * TILE;
    ctx.fillStyle = `rgba(255, 190, 79, ${0.8 * alpha})`;
    ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
    ctx.fillStyle = `rgba(255, 92, 62, ${0.65 * alpha})`;
    ctx.fillRect(x + 12, y + 12, TILE - 24, TILE - 24);
  }
}

function drawPlayer(): void {
  const x = player.position.x;
  const y = player.position.y;
  ctx.fillStyle = gameOver ? '#8d99a3' : '#5aa7ff';
  ctx.beginPath();
  ctx.arc(x, y, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2f7ff';
  ctx.fillRect(x - 5, y - 18, 10, 7);
  ctx.fillStyle = '#24364a';
  ctx.fillRect(x - 7, y - 3, 4, 4);
  ctx.fillRect(x + 3, y - 3, 4, 4);
}

function drawEnemy(): void {
  if (!enemy?.alive) {
    return;
  }

  const x = enemy.entity.position.x;
  const y = enemy.entity.position.y;
  ctx.fillStyle = '#e05d5d';
  ctx.beginPath();
  ctx.arc(x, y, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2f1717';
  ctx.fillRect(x - 8, y - 4, 5, 5);
  ctx.fillRect(x + 3, y - 4, 5, 5);
  ctx.fillStyle = '#f4a7a0';
  ctx.fillRect(x - 7, y + 6, 14, 3);
}

function forEachTile(callback: (col: number, row: number, kind: TileKind) => void): void {
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      callback(col, row, tileAt(col, row));
    }
  }
}

function tileAt(col: number, row: number): TileKind {
  return tiles[row]?.[col] ?? 'wall';
}

function setTile(col: number, row: number, kind: TileKind): void {
  const line = tiles[row];
  if (!line) {
    return;
  }
  line[col] = kind;
}

function isBorder(col: number, row: number): boolean {
  return col === 0 || row === 0 || col === COLS - 1 || row === ROWS - 1;
}

function isProtectedSpawn(col: number, row: number): boolean {
  return (col <= 2 && row <= 1) || (col <= 1 && row <= 2);
}

function isEnemySpawnArea(col: number, row: number): boolean {
  return col >= COLS - 3 && row >= ROWS - 3;
}

function isInside(col: number, row: number): boolean {
  return col >= 0 && row >= 0 && col < COLS && row < ROWS;
}

function tileCenter(index: number): number {
  return index * TILE + TILE / 2;
}

function worldToTile(x: number, y: number): { col: number; row: number } {
  return {
    col: Math.floor(x / TILE),
    row: Math.floor(y / TILE),
  };
}

function tileKey(col: number, row: number): string {
  return `${col},${row}`;
}

function tileId(prefix: string, col: number, row: number): string {
  return `${prefix}-${col}-${row}`;
}
