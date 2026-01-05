# Title Screen

The "title screen" GUI provides a start screen with an action list (for example: Start, Load, etc.).
The list is defined on the client by default and can be overridden by the server.

## Client-side usage (autoDisplay)

Load the GUI on the client to display it without the server. Add it in the client config under `gui` with `autoDisplay: true`.

```ts
import { TitleScreenComponent } from '@rpgjs/client'

export default {
  providers: [
    provideClientModules([
      {
        gui: [
          {
            id: 'rpg-title-screen',
            component: TitleScreenComponent,
            autoDisplay: true,
            data: {
              title: 'Chronicles',
              subtitle: 'of the Ancients',
              version: 'v1.0.0',
              localActions: true,
              saveLoad: {
                mode: 'load',
                slots: [null, null, null]
              },
              entries: [
                { id: 'start', label: 'Start' },
                { id: 'load', label: 'Load' },
                { id: 'credits', label: 'Credits', disabled: true }
              ]
            }
          }
        ]
      }
    ])
  ]
}
```

The component emits a `select` interaction with `{ id, index, entry }`.

When `localActions: true`:
- selecting `start` hides the title screen
- selecting `load` hides the title screen and displays the save/load GUI with `saveLoad`

## Client-side default list

Si le serveur ne fournit pas `entries`, la liste par defaut du client est:

```ts
[
  { id: 'start', label: 'Start' },
  { id: 'load', label: 'Load' }
]
```

To customize this list on the client, edit:

- `packages/client/src/components/gui/title-screen.ce`

## Style

Les classes CSS sont dans:

- `packages/ui-css/src/primitives/title-screen.css`

Vous pouvez changer la typo, le fond, ou les animations directement dans ce fichier.
