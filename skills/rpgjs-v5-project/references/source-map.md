# Source Map

## Canonical URLs

- RPGJS v5 quick start: `https://v5.rpgjs.dev/guide/quick-start.md`
- RPGJS v5 index: `https://v5.rpgjs.dev/llms.txt`
- CanvasEngine index: `https://canvasengine.net/llms.txt`
- RPGJS v5 repo branch: `https://github.com/RSamaium/RPG-JS/tree/v5`

## Minimal Fetch Workflow

Verify the project first:

```bash
rg -n '"@rpgjs|@rpgjs/' . --glob 'package.json'
```

Fetch the RPGJS index:

```bash
curl -fsSL https://v5.rpgjs.dev/llms.txt -o /tmp/rpgjs-v5-llms.txt
```

List Markdown URLs found in the index:

```bash
rg -o 'https://[^ )]+\\.md' /tmp/rpgjs-v5-llms.txt
```

Fetch one relevant page:

```bash
curl -fsSL https://v5.rpgjs.dev/guide/quick-start.md
```

Fetch the CanvasEngine index when `.ce` files are involved:

```bash
curl -fsSL https://canvasengine.net/llms.txt -o /tmp/canvasengine-llms.txt
rg -o 'https://[^ )]+\\.md' /tmp/canvasengine-llms.txt
```

If the index exposes relative links instead of absolute URLs, resolve them against the site origin before fetching.
