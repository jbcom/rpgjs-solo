import { startGame, provideMmorpg } from "@rpgjs/client";
import configClient from "./config/config.client";
import { mergeConfig } from "@signe/di";

startGame(
  mergeConfig(configClient, {
    // Use one player id per browser tab to simplify multi-tab latency testing.
    providers: [provideMmorpg({ connectionIdScope: "session" })],
  }) 
);
