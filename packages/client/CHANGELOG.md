# @rpgjs/client

## 5.0.0-beta.25

### Minor Changes

- 0512640: Add reusable typed input and textarea controls for standalone forms and dialog boxes, with shared server-side validation and an RPGJS Studio block that stores the submitted value.

### Patch Changes

- ccb9495: Fix TypeScript declaration errors across the package build, align multi-target declaration exports, complete movement API overloads, and make package and root builds fail when declaration generation reports a type error.
- Updated dependencies [ccb9495]
- Updated dependencies [f6aa046]
- Updated dependencies [0512640]
  - @rpgjs/common@5.0.0-beta.24
  - @rpgjs/server@5.0.0-beta.25
  - @rpgjs/ui-css@5.0.0-beta.23

## 5.0.0-beta.24

### Patch Changes

- e11f2ed: Fix main menu Escape handling, add outside-click and touch close controls for prebuilt modal GUIs, make menu layouts responsive on small screens, restore a compact desktop menu with an integrated sidebar and column-based item views, use fade-only menu transitions, improve Skills/Equipment and save slot spacing, make active menu rows less visually harsh, and improve HUD and dialog border rendering.
- 3fb2765: Apply Studio media scale as a multiplier of the default RPGJS display scale, then combine it with event instance scale instead of overwriting it.
- be412cf: Let Studio event-touch pressure plates overlap pushed events without physical separation, wait until ground sensors are mostly covered before firing, clean up touch tracking when collisions exit after z changes, and clamp route overshoot frames that could make pushed events jitter.
- Updated dependencies [e11f2ed]
- Updated dependencies [be412cf]
  - @rpgjs/ui-css@5.0.0-beta.22
  - @rpgjs/common@5.0.0-beta.23
  - @rpgjs/server@5.0.0-beta.24

## 5.0.0-beta.23

### Patch Changes

- e7d8d13: Hydrate Studio event hitboxes from the API initially, apply synchronized hitbox object payloads to client physics bodies, publish runtime Studio hitbox changes through the synced event collection instead of a separate setHitbox websocket path, and keep standalone map transfers on the restored room so transferred player positions and hitboxes are preserved in sample-dev.
- Updated dependencies [e7d8d13]
  - @rpgjs/common@5.0.0-beta.22
  - @rpgjs/server@5.0.0-beta.23

## 5.0.0-beta.22

### Patch Changes

- 1028c17: Use workspace protocol for internal RPGJS package dependencies during prerelease development so CI installs do not fetch unpublished beta packages from npm.
  - @rpgjs/server@5.0.0-beta.22

## 5.0.0-beta.20

### Patch Changes

- Release the next RPGJS beta while keeping the physics package unchanged.
- Updated dependencies
  - @rpgjs/common@5.0.0-beta.20
  - @rpgjs/server@5.0.0-beta.20
  - @rpgjs/ui-css@5.0.0-beta.20

## 5.0.0-beta.19

### Patch Changes

- Release the next RPGJS beta while keeping the physics package unchanged.
- Updated dependencies
  - @rpgjs/common@5.0.0-beta.19
  - @rpgjs/server@5.0.0-beta.19
  - @rpgjs/ui-css@5.0.0-beta.19

## 5.0.0-beta.17

### Patch Changes

- Release the next RPGJS beta while keeping the physics package on its stable release line.
- Updated dependencies
  - @rpgjs/common@5.0.0-beta.16
  - @rpgjs/server@5.0.0-beta.17
  - @rpgjs/ui-css@5.0.0-beta.14

## 5.0.0-beta.16

### Patch Changes

- Release the next RPGJS beta with terrain rendering performance improvements and a unified server tick loop.
- Updated dependencies
  - @rpgjs/common@5.0.0-beta.15
  - @rpgjs/server@5.0.0-beta.16
  - @rpgjs/ui-css@5.0.0-beta.13

## 5.0.0-beta.15

### Patch Changes

- dba133e: Queue early changeMap packets until the client has finished loading modules and GUI definitions.
  - @rpgjs/server@5.0.0-beta.15

## 5.0.0-beta.14

### Patch Changes

- Updated dependencies [c96b31a]
  - @rpgjs/common@5.0.0-beta.14
  - @rpgjs/server@5.0.0-beta.14

## 5.0.0-beta.13

### Patch Changes

- Release the next RPGJS beta with client interactions, i18n support, movement and physics improvements, Studio fixes, action battle updates, playground migration, and related runtime documentation.
- Updated dependencies
  - @rpgjs/common@5.0.0-beta.13
  - @rpgjs/server@5.0.0-beta.13
  - @rpgjs/ui-css@5.0.0-beta.12

## 5.0.0-beta.12

### Patch Changes

- Prepare beta.12 with action battle AI, area queries, client visuals, event component resolvers, projectile handling, and related Vite/runtime updates.
- Updated dependencies
  - @rpgjs/common@5.0.0-beta.12
  - @rpgjs/server@5.0.0-beta.12

## 5.0.0-beta.11

### Patch Changes

- Add projectile runtime support with client-side prediction, action input payload handling, pointer context helpers, standalone message handling, and MMORPG connection authentication.

  Add composable CanvasEngine scene map components and update built-in GUI/dynamic components for the current CanvasEngine release.

  - @rpgjs/common@5.0.0-beta.11
  - @rpgjs/server@5.0.0-beta.11
  - @rpgjs/ui-css@5.0.0-beta.11

## 5.0.0-beta.10

### Patch Changes

- Fix current-player control binding and canMove reads when values are provided by synced or reactive state.

  Fix Vue GUI rendering for hidden fixed GUIs while keeping attached GUI targets updated.

  - @rpgjs/server@5.0.0-beta.10

## 5.0.0-beta.9

### Major Changes

- c456d25: beta.9

### Patch Changes

- Updated dependencies [c456d25]
  - @rpgjs/common@5.0.0-beta.9
  - @rpgjs/server@5.0.0-beta.9
  - @rpgjs/ui-css@5.0.0-beta.9

## 5.0.0-beta.8

### Major Changes

- 35e7fa4: beta.8

### Patch Changes

- Updated dependencies [35e7fa4]
  - @rpgjs/common@5.0.0-beta.8
  - @rpgjs/server@5.0.0-beta.8
  - @rpgjs/ui-css@5.0.0-beta.8
