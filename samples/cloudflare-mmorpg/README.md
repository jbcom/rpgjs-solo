# RPGJS Cloudflare MMORPG sample

This sample runs the browser client with Vite and the authoritative RPGJS
server with Wrangler. Vite acts as a trusted development editor: it builds the
`demo` map payload and publishes it to the Worker administration endpoint.

```bash
cp .env.example .env.local
cp .dev.vars.example .dev.vars
pnpm install
pnpm dev
```

The value of `RPGJS_MAP_UPDATE_TOKEN` must be strictly identical in
`.env.local` (Vite publisher) and `.dev.vars` (Wrangler Worker). A mismatch is
rejected with `401 Unauthorized`.

Vite serves the client on `http://localhost:5173` and proxies `/parties` to
Wrangler on `http://127.0.0.1:8787`.

In production, an editor, deployment pipeline, or trusted backend sends the
same authenticated request:

```text
POST /parties/main/map-demo/map/update
x-rpgjs-map-update-token: <RPGJS_MAP_UPDATE_TOKEN>
```

Configure the production secret interactively with:

```bash
pnpm wrangler secret put RPGJS_MAP_UPDATE_TOKEN --env production
```

Before deployment, run `pnpm build`, `pnpm types`, `pnpm test`, and
`pnpm deploy:dry-run`.

This sample pins the last Wrangler 3 runtime that supports the GLIBC 2.31
development host used by the repository. Projects on a newer operating system
should update Wrangler and `@cloudflare/vitest-pool-workers` together to their
current compatible major versions.
