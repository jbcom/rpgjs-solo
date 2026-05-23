import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { rpgjs } from "@rpgjs/vite";
import startServer from "./src/server";
import playgroundConfig from "./playground.config.json";

export default defineConfig({
  server: {
    port: playgroundConfig.port,
    strictPort: true,
  },
  resolve: {
    dedupe: ["@canvasengine/presets", "canvasengine", "pixi.js"],
  },
  optimizeDeps: {
    exclude: ["canvasengine"],
    include: ["pixi.js > eventemitter3"],
  },
  plugins: [
    vue(),
    ...rpgjs({
      server: startServer,
    }),
  ],
});
