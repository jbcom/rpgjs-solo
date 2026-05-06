---
title: "Use a game with Studio"
description: "Connect an RPGJS game to RPGJS Studio data with provideStudioGame."
---

# Use a game with Studio

Use `provideStudioGame` when the current RPGJS game should load its maps, database, media references, and player start configuration from RPGJS Studio data.

## Install the package

```bash
npm install @rpgjs/studio
```

## Studio mode

In Studio mode, the game reads data from RPGJS Studio. Add `provideStudioGame` to both the client and server configurations and pass the Studio project identifier.

Client configuration:

```ts
// src/config/config.client.ts
import { provideStudioGame } from "@rpgjs/studio/client";

export const configClient = {
  providers: [
    provideStudioGame({
      projectId: "your-project-id",
    }),
  ],
};
```

Server configuration:

```ts
// src/config/config.server.ts
import { provideStudioGame } from "@rpgjs/studio/server";

export const configServer = {
  providers: [
    provideStudioGame({
      projectId: "your-project-id",
    }),
  ],
};
```

When `projectId` is set, the runtime uses online Studio data by default.

## Offline mode

Offline mode lets the game run from exported Studio data without calling the Studio API. Export the project data from Studio into the game public directory, using the default bundle path:

```text
public/
  game-data/
    project.json
    database.json
    events.json
    maps/
      <map-id>.json
    media/
      media-index.json
```

Then configure `provideStudioGame` without `projectId`, or force `runtimeMode` to `"offline"`:

```ts
provideStudioGame({
  runtimeMode: "offline",
});
```

By default, offline data is loaded from `/game-data`. Use `bundleBasePath` only if the exported folder is served from another path:

```ts
provideStudioGame({
  runtimeMode: "offline",
  bundleBasePath: "/my-game-data",
});
```

Offline database records are normalized before they are registered in RPGJS. Studio skill records are available to RPGJS skills automatically with their `spCost`, `hitRate`, `power`, and `coefficient` fields, and enemies can learn skills referenced by their `skills` array.

The project can define hero skill progression with `skills` or `skillsToLearn`. At runtime, `provideStudioGame()` creates a default RPGJS class containing those entries, then RPGJS learns each skill when the configured level is reached:

```json
{
  "skills": [
    { "level": 1, "skillId": "slash-id" },
    { "level": 5, "skillId": "fire-id" }
  ]
}
```

Studio listens to the RPGJS `player.onSkillChange` hook and displays a notification when the hero learns or forgets a skill.

Enemy records can also drive action-battle AI. Use `behavior` on the enemy to set fields such as `enemyType`, `behaviorKey`, `visionRange`, `attackRange`, `attackCooldown`, `dodgeChance`, `dodgeCooldown`, `fleeThreshold`, `attackPatterns`, `patrolWaypoints`, `groupBehavior`, or the nested behavior gauge options. The older `aiBehavior` field is still accepted as a compatibility alias. If the enemy has `attackSkillId`, that skill is used for attacks; otherwise the first learned enemy skill is used.

## Auto mode

Use `"auto"` when the game should try the exported bundle first, then fall back to Studio if local data is missing:

```ts
provideStudioGame({
  projectId: "your-project-id",
  runtimeMode: "auto",
});
```

## Options

- `projectId`: Studio project identifier. When provided, the default runtime mode is `"online"`.
- `runtimeMode`: data loading strategy. Use `"online"`, `"offline"`, or `"auto"`.
- `bundleBasePath`: public path for exported Studio data. Defaults to `/game-data`.
- `displayTitleScreen`: display the Studio title screen when supported by the project.
- `startMapId`: force the map used to start the player.
