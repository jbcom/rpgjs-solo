import { mergeConfig } from "@signe/di";
import { provideMmorpg, provideRpg, startGame } from "@rpgjs/client";
import startServer from "./server";
import configClient from "./config/config.client";

startGame(
  mergeConfig(configClient, {
    providers: [provideMmorpg(startServer)],
  }),
);
