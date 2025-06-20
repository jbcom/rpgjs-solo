import { startGame, provideMmorpg } from "@rpgjs/client";
import configClient from "./config/config.client";
import { mergeConfig } from "@signe/di";

startGame(
  mergeConfig(configClient, {
    providers: [provideMmorpg({ host: "localhost:5176" })],
  })
);
