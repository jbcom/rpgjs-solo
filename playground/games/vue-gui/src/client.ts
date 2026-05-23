import { mergeConfig } from "@signe/di";
import { provideMmorpg, startGame } from "@rpgjs/client";
import configClient from "./config/config.client";

startGame(
  mergeConfig(configClient, {
    providers: [
      provideMmorpg(),
    ],
  }),
);
