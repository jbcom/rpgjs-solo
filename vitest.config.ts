import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@rpgjs/testing": path.resolve(__dirname, "packages/testing/src"),
      "@rpgjs/common": path.resolve(__dirname, "packages/common/src"),
      "@rpgjs/server": path.resolve(__dirname, "packages/server/src"),
      "@rpgjs/physic": path.resolve(__dirname, "packages/physic/src"),
      "@rpgjs/vite": path.resolve(__dirname, "packages/vite/src"),
      "@rpgjs/vue": path.resolve(__dirname, "packages/vue/src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    silent: true,
    setupFiles: ["./packages/testing/src/setup.ts"],
    hookTimeout: 15000,
    testTimeout: 15000,
  },
});
