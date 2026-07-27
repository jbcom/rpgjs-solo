import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// `isolatedStorage` was removed from WorkersPoolOptions in
// @cloudflare/vitest-pool-workers 0.18 (migrated from 0.5.41 as part
// of the vitest 4 upgrade) — isolated per-test storage is no longer
// configurable and is the only supported behavior.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.test.jsonc" },
      miniflare: {
        bindings: {
          RPGJS_MAP_UPDATE_TOKEN: "test-map-update-token",
        },
      },
    }),
  ],
});
