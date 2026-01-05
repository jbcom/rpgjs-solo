import { inject } from "@signe/di";
import { Action, MockConnection, Room } from "@signe/room";
import { Hooks, ModulesToken } from "@rpgjs/common";
import { context } from "../core/context";
import { users } from "@signe/sync";
import { signal } from "@signe/reactive";
import { RpgPlayer } from "../Player/Player";
import { BaseRoom } from "./BaseRoom";
import { buildSaveSlotMeta, resolveSaveStorageStrategy } from "../services/save";

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
    this.hooks.callHooks("server-player-onConnected", player).subscribe();
  }

  @Action('gui.interaction')
  async guiInteraction(player: RpgPlayer, value: { guiId: string, name: string, data: any }) {
    const id = value.data.id
    if (id === 'start') {
      this.hooks.callHooks("server-player-onStart", player).subscribe();
    }
  }

  @Action('save.list')
  async listSaveSlots(player: RpgPlayer, value: { requestId: string }) {
    const storage = resolveSaveStorageStrategy();
    try {
      const slots = await storage.list(player);
      player.emit('save.list.result', { requestId: value?.requestId, slots });
    } catch (error: any) {
      player.emit('save.error', { requestId: value?.requestId, message: error?.message || 'save.list failed' });
    }
  }

  @Action('save.save')
  async saveSlot(player: RpgPlayer, value: { requestId: string; index: number; meta?: any }) {
    const storage = resolveSaveStorageStrategy();
    try {
      if (typeof value?.index !== 'number') {
        throw new Error('save.save requires an index');
      }
      const snapshot = await player.save();
      const meta = buildSaveSlotMeta(player, value?.meta);
      await storage.save(player, value.index, snapshot, meta);
      const slots = await storage.list(player);
      player.emit('save.save.result', { requestId: value?.requestId, index: value.index, slots });
    } catch (error: any) {
      player.emit('save.error', { requestId: value?.requestId, message: error?.message || 'save.save failed' });
    }
  }

  @Action('save.load')
  async loadSlot(player: RpgPlayer, value: { requestId: string; index: number }) {
    const storage = resolveSaveStorageStrategy();
    try {
      if (typeof value?.index !== 'number') {
        throw new Error('save.load requires an index');
      }
      const slot = await storage.get(player, value.index);
      if (!slot?.snapshot) {
        player.emit('save.load.result', { requestId: value?.requestId, index: value.index, ok: false });
        return;
      }
      await player.load(slot.snapshot);
      const { snapshot, ...meta } = slot;
      player.emit('save.load.result', { requestId: value?.requestId, index: value.index, ok: true, slot: meta });
    } catch (error: any) {
      player.emit('save.error', { requestId: value?.requestId, message: error?.message || 'save.load failed' });
    }
  }
}
