import { inject } from "@signe/di";
import { MockConnection, Room } from "@signe/room";
import { Hooks, ModulesToken } from "@rpgjs/common";
import { context } from "../core/context";
import { users } from "@signe/sync";
import { signal } from "@signe/reactive";
import { RpgPlayer } from "../Player/Player";
import { BaseRoom } from "./BaseRoom";

@Room({
  path: "lobby-{id}",
})
export class LobbyRoom extends BaseRoom {
  @users(RpgPlayer) players = signal({});
  autoSync: boolean = true;

  constructor(room) {
    super();
    const isTest = room.env.TEST === 'true' ? true : false;
    if (isTest) {
      this.autoSync = false;
    }
  }

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
