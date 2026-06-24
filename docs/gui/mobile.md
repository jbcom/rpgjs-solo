# Mobile Controls

RPGJS ships a CanvasEngine mobile overlay through `withMobile()`. It renders a
virtual joystick and action buttons over the game canvas, and forwards touches to
the same controls used by keyboard and gamepad input.

## Enable Mobile Controls

Add `withMobile()` to your client modules:

```ts
import { provideClientModules, withMobile } from '@rpgjs/client'

export default {
  providers: [
    provideClientModules([
      withMobile()
    ])
  ]
}
```

By default, the overlay is displayed only on mobile user agents and waits until
the current player controls are available.

## Configure the Overlay

Use `enabled: "always"` while testing from a desktop browser:

```ts
withMobile({
  enabled: 'always',
  joystick: {
    outerColor: '#d7e7ff',
    innerColor: '#ffffff',
    scale: 0.82,
    moveInterval: 40,
    threshold: 0.15
  },
  buttons: {
    action: true,
    back: true,
    dash: true
  }
})
```

Available options:

| Option | Description |
| --- | --- |
| `id` | GUI id. Defaults to `mobile-gui`. |
| `enabled` | `"auto"`, `"always"`, `"never"`, or a predicate. Defaults to `"auto"`. |
| `joystick` | Set to `false` to hide it, or pass colors, scale, and movement settings. `outerScale` and `innerScale` are available when using custom joystick sprites. |
| `buttons.action` | Shows the A button and triggers the `action` control. |
| `buttons.back` | Shows the B button and triggers the `back` control. |
| `buttons.dash` | Shows the D button and triggers the `dash` control. |

## Runtime Behavior

Mobile controls are client-side input helpers. In standalone mode and MMORPG
mode they send the same movement and action inputs as keyboard/gamepad controls;
they do not create gameplay authority on the client.

The virtual joystick uses CanvasEngine's `Joystick` component for input. RPGJS
movement is cardinal, so diagonal joystick positions are resolved to the nearest
single RPGJS movement control before being repeated.
