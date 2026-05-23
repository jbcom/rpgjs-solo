# Tiled Maps

Tiled map loading, tileset assets, map compilation, and RPGJS map integration.

## Run

From the repository root:

```bash
pnpm playground
```

Then select **Tiled Maps** in the launcher at `http://localhost:5174`.

Run only this game:

```bash
pnpm --dir playground dev:tiled
```

Direct URL: `http://localhost:5183`.

## Assets

This game uses Tiled `.tmx` and `.tsx` files from `src/tiled`. The Vite config
uses `tiledMapFolderPlugin()` to serve those files at `/map` during development
and copy them into the build output.

## Credits

Sounds: [Davidvitas](https://www.davidvitas.com/portfolio/2016/5/12/rpg-music-pack), Attribution 4.0 International.

Graphics: [Pipoya](https://pipoya.itch.io)

Icons: [game-icons.net](https://game-icons.net)
