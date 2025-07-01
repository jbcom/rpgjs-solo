import { RpgCommonMap } from "@rpgjs/common";
import { sync, users } from "@signe/sync";
import { RpgClientPlayer } from "./Player";
import { Signal, signal, computed } from "canvasengine";
import { RpgClientEvent } from "./Event";
import { RpgClientEngine } from "../RpgClientEngine";
import { inject } from "../core/inject";

export class RpgClientMap extends RpgCommonMap<RpgClientPlayer> {
  engine: RpgClientEngine = inject(RpgClientEngine)
  @users(RpgClientPlayer) players = signal<Record<string, RpgClientPlayer>>({});
  @sync(RpgClientEvent) events = signal<Record<string, RpgClientEvent>>({});
  currentPlayer = computed(() => this.players()[this.engine.playerIdSignal()!])

  getCurrentPlayer() {
    return this.currentPlayer()
  }
}
