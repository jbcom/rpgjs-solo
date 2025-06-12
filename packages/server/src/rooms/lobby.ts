import { inject } from "@signe/di";
import { MockConnection, Room } from "@signe/room";
import { Hooks, ModulesToken } from "@rpgjs/common";
import { context } from "../core/context";
import { users } from "@signe/sync";
import { signal } from "@signe/reactive";
import { RpgPlayer } from "../Player/Player";

@Room({
  path: "lobby-{id}",
})
export class LobbyRoom {
  @users(RpgPlayer) players = signal({});

  onJoin(player: RpgPlayer, conn: MockConnection) {
    player.map = this;
    player.context = context;
    player.conn = conn;
    const hooks = inject<Hooks>(context, ModulesToken);
    hooks
      .callHooks("server-player-onConnected", player)
      .subscribe();
  }
}
