# @rpgjs/common

## 5.0.0-beta.23

### Patch Changes

- be412cf: Let Studio event-touch pressure plates overlap pushed events without physical separation, wait until ground sensors are mostly covered before firing, clean up touch tracking when collisions exit after z changes, and clamp route overshoot frames that could make pushed events jitter.

## 5.0.0-beta.22

### Patch Changes

- e7d8d13: Hydrate Studio event hitboxes from the API initially, apply synchronized hitbox object payloads to client physics bodies, publish runtime Studio hitbox changes through the synced event collection instead of a separate setHitbox websocket path, and keep standalone map transfers on the restored room so transferred player positions and hitboxes are preserved in sample-dev.

## 5.0.0-beta.20

### Patch Changes

- Release the next RPGJS beta while keeping the physics package unchanged.

## 5.0.0-beta.19

### Patch Changes

- Release the next RPGJS beta while keeping the physics package unchanged.

## 5.0.0-beta.16

### Patch Changes

- Release the next RPGJS beta while keeping the physics package on its stable release line.

## 5.0.0-beta.15

### Patch Changes

- Release the next RPGJS beta with terrain rendering performance improvements and a unified server tick loop.

## 5.0.0-beta.14

### Patch Changes

- c96b31a: Add generic event touch hooks, shared map variables, and automatic variable change synchronization.

## 5.0.0-beta.13

### Patch Changes

- Release the next RPGJS beta with client interactions, i18n support, movement and physics improvements, Studio fixes, action battle updates, playground migration, and related runtime documentation.
- Updated dependencies
  - @rpgjs/physic@5.0.1-beta.0

## 5.0.0-beta.12

### Patch Changes

- Prepare beta.12 with action battle AI, area queries, client visuals, event component resolvers, projectile handling, and related Vite/runtime updates.

## 5.0.0-beta.11

### Patch Changes

- Add shared action input definitions and module metadata updates used by projectile and interaction flows.

## 5.0.0-beta.10

### Patch Changes

- Prepare beta.10 release.

## 5.0.0-beta.9

### Major Changes

- c456d25: beta.9

## 5.0.0-beta.8

### Major Changes

- 35e7fa4: beta.8
