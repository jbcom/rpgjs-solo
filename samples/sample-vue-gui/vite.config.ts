import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { rpgjs } from "@rpgjs/vite";
import startServer from "./src/server";

export default defineConfig({
  optimizeDeps: {
    exclude: ["canvasengine"],
  },
  plugins: [
    vue(),
    ...rpgjs({
      server: startServer,
    }),
  ],
});
