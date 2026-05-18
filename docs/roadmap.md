---
title: "Roadmap"
description: "Future RPGJS improvements under consideration."
---

# Roadmap

This page lists future improvements that are being considered. Items here are
not stable APIs until they are implemented and documented in the relevant guide
or API reference.

## Input Context For Actions

`RpgClientEngine.processAction()` already supports custom action data:

```ts
client.processAction('projectile:shoot', {
  target: { x, y },
  source: 'map-click'
})
```

RPGJS now exposes `client.pointer`, and keyboard actions from `character.ce` can
send custom action data through `keyboardControls.action`. A remaining future
improvement is to make other built-in input sources, such as map clicks and
event clicks, provide a consistent action context without each feature wiring
its own pointer state.

The intended shape is:

```ts
client.processAction('projectile:shoot', {
  target: client.pointer.world(),
  source: 'keyboard'
})
```

Or through richer keyboard control configuration:

```ts
provideClientGlobalConfig({
  keyboardControls: {
    action: {
      bind: 'space',
      action: 'projectile:shoot',
      data: (client, sprite) => ({
        target: client.pointer.world(),
        source: 'keyboard',
        playerId: sprite.id
      })
    }
  }
})
```

On the server, the player hook would continue to receive a normal action input:

```ts
const player = {
  onInput(player, input) {
    if (input.action === 'projectile:shoot') {
      const target = input.data?.target
    }
  }
}
```

The main design constraint is that `character.ce` should stay generic. It can
send custom action data only if RPGJS exposes a reliable client-side input
context, such as a pointer world position helper, selected target helper, or
action context resolver.

Implemented:

- Add an official `client.pointer` helper.
- Let `keyboardControls.action` accept an object form with `bind`, `action`, and
  optional static or functional `data`.
- Keep simple string controls compatible with the current behavior.

Potential follow-up work:

- Let map clicks emit action inputs with world coordinates.
- Let event clicks emit action inputs with `eventId` and world coordinates.
