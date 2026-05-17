---
title: "Projectiles"
description: "Emit server-authoritative projectiles and render them with CanvasEngine components."
---

# Projectiles

Use projectiles for arrows, spells, bullets, beams, and other temporary moving
effects that need server-side impact validation without synchronizing their
position every frame.

The server is authoritative. It emits compact projectile spawn, impact, and
destroy batches. The client predicts the visual movement locally and renders
each projectile with a registered CanvasEngine component.

## Server Usage

Emit a projectile from a player:

```ts
import { Direction, RpgPlayerHooks } from '@rpgjs/server'

export const player: RpgPlayerHooks = {
  onInput(player, { input }) {
    if (input !== 'attack') return

    player.projectiles.emit({
      type: 'fireball',
      direction: player.getDirection(),
      trajectory: {
        type: 'linear',
        speed: 420,
        range: 600,
        ttl: 1.5
      },
      payload: {
        damage: 20,
        element: 'fire'
      },
      params: {
        sprite: 'fireball',
        radius: 8,
        trail: true
      }
    })
  }
}
```

`payload` stays server-side and is useful for damage, states, knockback, or any
other gameplay data. `params` is sent to clients and should contain only visual
data used by the projectile component.

You can also emit from the map:

```ts
map.projectiles.emit({
  type: 'arrow',
  origin: { x: 100, y: 200 },
  direction: Direction.Right,
  trajectory: {
    type: 'linear',
    speed: 500,
    range: 700
  }
})
```

## Repeats And Patterns

Use `repeat` for a compact burst. The server broadcasts one spawn batch with
per-projectile delays, so clients can render the whole burst without receiving a
position update every frame.

```ts
player.projectiles.emit({
  type: 'spark',
  direction: player.getDirection(),
  trajectory: {
    type: 'linear',
    speed: 700,
    range: 500
  },
  repeat: {
    count: 8,
    interval: 50,
    spread: 12,
    seed: true
  }
})
```

Use `pattern` for common shapes:

```ts
player.projectiles.emit({
  type: 'ice-shard',
  direction: player.getDirection(),
  trajectory: {
    type: 'linear',
    speed: 480,
    range: 500
  },
  pattern: {
    type: 'cone',
    count: 5,
    angle: 45
  }
})
```

```ts
player.projectiles.emit({
  type: 'magic-orb',
  trajectory: {
    type: 'linear',
    speed: 260,
    range: 400
  },
  pattern: {
    type: 'circle',
    count: 12
  }
})
```

## Impact Hooks

Use projectile hooks to apply gameplay effects when the server confirms an
impact:

```ts
import { RpgServer } from '@rpgjs/server'

export const server: RpgServer = {
  projectiles: {
    onImpact({ projectile, target }) {
      if (!target) return

      const damage = Number(projectile.payload?.damage ?? 0)
      target.hp -= damage
    },

    onDestroy({ projectile, reason }) {
      console.log(projectile.id, reason)
    }
  }
}
```

You can also filter hits per projectile:

```ts
player.projectiles.emit({
  type: 'holy-bolt',
  direction: player.getDirection(),
  trajectory: {
    type: 'linear',
    speed: 450,
    range: 700
  },
  canHit({ owner, target }) {
    return Boolean(target && target.team !== owner?.team)
  }
})
```

## Client Registration

Register a CanvasEngine component for each projectile type:

```ts
import { RpgClient } from '@rpgjs/client'
import FireballProjectile from './components/fireball-projectile.ce'

export const client: RpgClient = {
  projectiles: {
    components: {
      fireball: FireballProjectile
    }
  }
}
```

## Projectile Component

Projectile components receive predicted movement props from the client runtime.

```html
<!-- components/fireball-projectile.ce -->
<Container x={x} y={y} rotation={angle}>
  <Sprite sheet={sheet} anchor={0.5} scale={scale} />
</Container>

<script>
  import { computed } from 'canvasengine'
  import { inject, RpgClientEngine } from '@rpgjs/client'

  const {
    x,
    y,
    angle,
    speed,
    range,
    distance,
    progress,
    elapsed,
    direction,
    params,
    impact
  } = defineProps()

  const engine = inject(RpgClientEngine)

  const sheet = computed(() => ({
    definition: engine.getSpriteSheet(params()?.sprite ?? 'fireball'),
    playing: impact() ? 'impact' : 'default'
  }))

  const scale = computed(() => 1 + progress() * 0.2)
</script>
```

Common props:

- `id`, `type`, `ownerId`
- `x`, `y`, `origin`, `direction`, `angle`
- `speed`, `range`, `ttl`, `distance`, `elapsed`, `progress`
- `index`, `count` for repeated or patterned projectiles
- `params` for visual customization
- `impact` when the server confirms a collision

Do not apply damage in the component. Components are visual only; gameplay
effects belong in server projectile hooks.
