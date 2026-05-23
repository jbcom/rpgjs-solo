---
title: "Client Visuals"
description: "Group client-side visual and audio primitives behind a server-triggered visual name."
---

# Client Visuals

Client visuals let the server trigger a named visual macro while the rendering
details live on the client.

They do not replace existing APIs such as `playSound()`, `flash()`,
`showComponentAnimation()`, or sprite animations. They are a lightweight way to
group those existing client-side primitives when one gameplay moment needs
several visual or audio reactions at once.

## Why use client visuals?

Without client visuals, a hit may require several server packets:

```ts
target.flash()
target.showHit("-25")
target.showComponentAnimation("hit-spark", { scale: 1.2 })
player.playSound("hit")
```

With client visuals, the server sends one compact packet:

```ts
player.clientVisual("hit", {
  targetId: target.id,
  damage: 25,
})
```

The client decides how `hit` is rendered. This keeps visual orchestration close
to the renderer, avoids spreading presentation details through server gameplay
code, and reduces bandwidth when several visual operations should happen
together.

## When to prefer client visuals

Use client visuals when:

- one gameplay moment triggers multiple visual or audio operations
- the visual sequence is client presentation only
- you want to customize rendering without changing server gameplay code
- you want to reduce several visual packets to one server event

Prefer the direct APIs when you only need one operation:

```ts
player.playSound("door-open")
player.flash()
map.showComponentAnimation("explosion", { x: 100, y: 120 }, { scale: 2 })
```

Client visuals should not own gameplay authority. Damage, states, cooldowns,
movement, rewards, and combat results should still be decided by the server.

## Register a client visual

Register visuals in a client module with `clientVisuals`:

```ts
import { defineModule, RpgClient } from "@rpgjs/client";
import HitSpark from "./hit-spark.ce";

export default defineModule<RpgClient>({
  componentAnimations: [
    {
      id: "hit-spark",
      component: HitSpark,
    },
  ],
  clientVisuals: {
    hit({ target, data }, helpers) {
      helpers.flash(target, {
        type: "tint",
        tint: "red",
        duration: 120,
      });
      helpers.showHit(target, `-${data.damage}`);
      helpers.component("hit-spark", target, {
        scale: data.critical ? 1.4 : 1,
      });
      helpers.sound(data.critical ? "critical-hit" : "hit");
    },
  },
});
```

The handler receives:

- `target`, `source`, and `object`, resolved from `targetId`, `sourceId`, and
  `objectId`
- `position`, resolved from `position` or `{ x, y }`
- `data`, the serializable payload sent by the server
- `helpers`, a small wrapper around existing client primitives

You can also pass `target`, `source`, or `object` instead of the `*Id` fields
when the payload already contains an object id string. The `*Id` names are
usually clearer for server payloads.

The first argument passed to `helpers.component()` is a component animation id.
Register that id in the same client module with `componentAnimations`, or in
another loaded client module, before using it from `clientVisuals`.

## Trigger from a player

`player.clientVisual()` sends the visual only to that player's client:

```ts
player.clientVisual("hit", {
  targetId: enemy.id,
  damage: 25,
  critical: false,
});
```

This is useful for private feedback such as UI confirmation, personal rewards,
or effects only one player should see.

## Trigger from a map

`map.clientVisual()` broadcasts the visual to all players currently on the map:

```ts
map.clientVisual("explosion", {
  position: { x: 320, y: 180 },
  power: 2,
});
```

And the client can render it at a position:

```ts
export default defineModule<RpgClient>({
  clientVisuals: {
    explosion({ position, data }, helpers) {
      helpers.component("explosion", position, {
        scale: data.power,
      });
      helpers.sound("explosion", { volume: 0.8 });
      helpers.shake({ intensity: 4, duration: 180 });
    },
  },
});
```

## Available helpers

```ts
helpers.getObject(id)
helpers.flash(target, options)
helpers.showHit(target, text)
helpers.component(id, targetOrPosition, params)
helpers.sound(id, options)
helpers.animation(target, animationName, options)
helpers.shake(options)
```

These helpers call the same rendering capabilities RPGJS already exposes on the
client. Client visuals only group them behind a named client-side function.

`target`, `source`, and `object` are resolved client objects. You can pass them
directly to helpers, or pass an object id string to helpers that accept a target.
If a target cannot be resolved, the helper quietly does nothing.

Use `helpers.component(id, target, params)` to display a registered component
animation on an object. Use `helpers.component(id, position, params)` to display
it at a map position:

```ts
helpers.component("explosion", { x: 320, y: 180 }, { scale: 2 })
```

Use `helpers.animation(target, animationName, options)` for sprite animations.
Pass `graphic` when the animation should use a different graphic, and `repeat`
when it should play more than once:

```ts
helpers.animation(target, "attack", { repeat: 1 })
helpers.animation(target, "cast", { graphic: "mage", repeat: 2 })
```

## Payload rules

The payload sent by the server must be serializable:

```ts
player.clientVisual("reward", {
  targetId: player.id,
  itemId: "potion",
  amount: 3,
});
```

Do not send functions, class instances, or rendering components from the
server. Register rendering details in `clientVisuals` and send only IDs, numbers,
strings, booleans, arrays, and plain objects.

## Complete example

This example registers a hit spark component on the client, groups the spark,
flash, hit text, and sound in one client visual, then triggers that visual from
server gameplay code.

```ts
// client/module.ts
import { defineModule, RpgClient } from "@rpgjs/client";
import HitSpark from "./hit-spark.ce";

export default defineModule<RpgClient>({
  componentAnimations: [
    {
      id: "hit-spark",
      component: HitSpark,
    },
  ],
  clientVisuals: {
    hit({ target, data }, helpers) {
      helpers.flash(target, { type: "tint", tint: "red", duration: 120 });
      helpers.showHit(target, `-${data.damage}`);
      helpers.component("hit-spark", target, {
        scale: data.critical ? 1.4 : 1,
      });
      helpers.sound(data.critical ? "critical-hit" : "hit");
    },
  },
});
```

```ts
// server/combat.ts
target.hp -= damage;

player.clientVisual("hit", {
  targetId: target.id,
  damage,
  critical,
});
```

The server keeps the gameplay result authoritative. The client only decides how
the `hit` visual is presented.
