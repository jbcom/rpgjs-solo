import { provideMmorpg, startGame } from "@rpgjs/client";

startGame({
  providers: [provideMmorpg({ connectionIdScope: "session" })],
});
