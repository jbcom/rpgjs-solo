# Vue GUI

This game demonstrates the detached `@rpgjs/vue` package with RPGJS v5:

- fixed Vue GUI overlay (`vue-hud`)
- server-opened Vue modal (`vue-inventory`)
- server-opened Vue panel (`vue-quest-log`)
- sprite-attached Vue GUI (`vue-nameplate`)
- Vue-to-server GUI interactions through `rpgGuiInteraction`
- Vue close events through `rpgGuiClose`

## Run

From the repository root:

```bash
pnpm playground
```

Then select **Vue GUI** in the launcher at `http://localhost:5174`.

Run only this game:

```bash
pnpm --dir playground dev:vue-gui
```

Direct URL: `http://localhost:5185`.

Use the action key to open the inventory. Use Escape to open the quest log.
