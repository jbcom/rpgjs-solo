import { inject } from "@signe/di";
import { Action, Room, type RoomMethods } from "@signe/room";
import { Hooks, ModulesToken } from "@rpgjs/common";
import { context } from "../core/context";
import { users } from "@signe/sync";
import { signal } from "@signe/reactive";
import { RpgPlayer } from "../Player/Player";
import { BaseRoom } from "./BaseRoom";
import { buildSaveSlotMeta, resolveSaveStorageStrategy } from "../services/save";
import { lastValueFrom } from "rxjs";

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

  async onJoin(player: RpgPlayer, conn: Parameters<RoomMethods["$send"]>[0]) {
    player.map = this as unknown as RpgPlayer["map"];
    player.context = context;
    player.conn = conn;
    await lastValueFrom(this.hooks.callHooks("server-player-onConnected", player));
    (this as any).$applySync?.();
  }

  @Action('gui.interaction')
  async guiInteraction(player: RpgPlayer, value: { guiId: string, name: string, data: any }) {
    const id = value.data.id
    if (id === 'start') {
      player.initializeDefaultStats();
      try {
        await lastValueFrom(this.hooks.callHooks("server-player-onStart", player));
      }
      catch (error) {
        console.error("[RPGJS] Error during player onStart hooks:", error);
      }
    }
  }
}
