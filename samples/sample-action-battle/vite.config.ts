import { defineConfig } from "vite";
import { rpgjs } from "@rpgjs/vite";
import startServer from "./src/server";

export default defineConfig({
  plugins: [
    ...rpgjs({
      server: startServer,
      entryPoints: {
        mmorpg: {
          client: "./src/client.ts",
          server: "./src/server.ts",
        },
      },
    }),
  ],
});
