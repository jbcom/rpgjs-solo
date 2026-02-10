import { startGame, provideMmorpg } from "@rpgjs/client";
import configClient from "./config/config.client";
import { mergeConfig } from "@signe/di";

startGame(
  mergeConfig(configClient, {
    // Use one player id per page instance to avoid stale session restore during dev reloads.
    providers: [provideMmorpg({ connectionIdScope: "ephemeral" })],
  }) 
);
