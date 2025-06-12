import { RpgCommonMap } from "@rpgjs/common";
import { sync, users } from "@signe/sync";
import { RpgClientPlayer } from "./Player";
import { Signal, signal } from "canvasengine";
import { RpgClientEvent } from "./Event";

export class RpgClientMap extends RpgCommonMap<RpgClientPlayer> {
  @users(RpgClientPlayer) players = signal<Record<string, RpgClientPlayer>>({});
  @sync(RpgClientEvent) events = signal<Record<string, RpgClientEvent>>({});
}
