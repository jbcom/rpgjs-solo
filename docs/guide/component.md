---
title: "Authoritative Sprite Components"
description: "Display reusable sprite components from the server while keeping rendering on the client."
---

# Authoritative Sprite Components

Sprite components are CanvasEngine components (`.ce`) rendered around a sprite.
RPGJS has two complementary APIs:

- client-side sprite components, configured with `componentsBehind` and `componentsInFront`, for visuals that apply to every sprite
- server-driven sprite components, configured with `player.setComponentsTop()` and related methods, for visuals controlled by the server for one player

The server never imports `.ce` files. It only sends a component id and serializable props. The client owns the renderer.

## Built-in Components

Use the `Components` helpers for common RPG UI:

```ts
import { Components } from '@rpgjs/server'

player.setComponentsTop([
  Components.text('{name}', {
    fill: '#ffffff',
    fontSize: 12
  }),
  Components.hpBar({
    width: 50,
    height: 6,
    fillColor: '#4ade80'
  })
])
```

`Components.hpBar()` uses a red fill by default. `Components.spBar()` uses a
blue fill by default. Pass `fillColor` to override either color.

You can place components around the player:

```ts
player.setComponentsTop(Components.text('{name}'))
player.setComponentsBottom(Components.hpBar())
player.setComponentsLeft(Components.shape({
  type: 'circle',
  fill: '#ff0000',
  radius: 4
}))

player.removeComponents('top')
```

Component text and props can use placeholders such as `{name}`, `{hp}`,
`{sp}`, `{param.maxHp}`, or any synchronized player property.

Shape components are centered from their rendered bounds. For example, a
`32x32` rectangle centered in a `32x32` hitbox matches the hitbox exactly.

Bar text is displayed above the bar and aligned to the left edge of the bar.
It stays at the same position when the current value changes. The text can use
normal player placeholders and bar-specific placeholders:

```ts
player.setComponentsTop(Components.hpBar({
  width: 60,
  height: 6,
  textColor: '#ffffff',
  fontSize: 10
}, 'HP: {$current}/{$max} - {name}'))

player.setComponentsTop(Components.hpBar({}, null)) // no text
```

- `{$current}`: current value
- `{$max}`: maximum value
- `{$percent}`: percentage without the `%` sign

## Custom Components

Register reusable components on the client:

```ts
// client.ts
import { defineModule, RpgClient } from '@rpgjs/client'
import GuildBadge from './components/guild-badge.ce'

export default defineModule<RpgClient>({
  sprite: {
    components: {
      guildBadge: GuildBadge
    }
  }
})
```

Create the CanvasEngine component:

```html
<!-- components/guild-badge.ce -->
<Container>
  <Text text={guildName} color={color} size="10" />
</Container>

<script>
  const { guildName, color } = defineProps({
    color: {
      default: '#ffffff'
    }
  })
</script>
```

Then let the server decide when to display it:

```ts
import { Components } from '@rpgjs/server'

player.setComponentsTop([
  Components.custom('guildBadge', {
    guildName: '{guild.name}',
    color: '{guild.color}'
  })
])
```

Custom props must be serializable: strings, numbers, booleans, arrays, and plain objects.

## Layout

Pass layout options as the second argument:

```ts
player.setComponentsTop([
  Components.text('{name}'),
  Components.hpBar()
], {
  width: 80,
  height: 16,
  marginBottom: 8
})
```

`top`, `left`, and `right` are anchored outside the sprite graphic bounds, so
they do not cover frames that are larger than the hitbox. `top` is centered on
the graphic. `bottom` uses the hitbox as its positioning rectangle and centers
the component inside that rectangle, so a `32x32` shape on a `32x32` hitbox
matches the hitbox. Use positive margins to move a component away from the
sprite: `marginBottom` for `top` and `bottom`, `marginRight` for `left`, and
`marginLeft` for `right`.

A one-dimensional array is rendered vertically. A two-dimensional array is rendered as rows and columns:

```ts
player.setComponentsTop([
  [Components.text('{name}'), Components.hpBar()]
])
```

## Difference With Animations

Use server-driven sprite components for persistent UI controlled by the server:
name tags, HP bars, guild badges, status icons.

Use `componentAnimations` and `showComponentAnimation()` for temporary effects:
hit numbers, explosions, spell effects, and transitions that remove themselves with `onFinish`.
