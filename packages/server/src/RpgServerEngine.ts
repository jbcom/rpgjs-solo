import { Server } from "@signe/room";
import { RpgMap } from "./rooms/map";
import { LobbyRoom } from "./rooms/lobby";

export class RpgServerEngine extends Server {
  rooms = [RpgMap, LobbyRoom];
}
