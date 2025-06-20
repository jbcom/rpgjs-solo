import { Context } from "@signe/di";
import { connectionRoom } from "@signe/sync/client";
import { RpgGui } from "../Gui/Gui";
import { RpgClientEngine } from "../RpgClientEngine";
import { AbstractWebsocket, WebSocketToken } from "./AbstractSocket";
import { UpdateMapService, UpdateMapToken } from "@rpgjs/common";

interface MmorpgOptions {
    host?: string;
}

class BridgeWebsocket extends AbstractWebsocket {
    private socket: any;

  constructor(protected context: Context, private options: MmorpgOptions = {}) {
    super(context);
  }

  async connection(listeners?: (data: any) => void) {
    // tmp
    class Room {
        
    }
    const instance = new Room()
    this.socket = await connectionRoom({
        host: this.options.host || window.location.host,
        room: "lobby-1",
    }, instance)

    listeners?.(this.socket)
  }

  on(key: string, callback: (data: any) => void) {
    this.socket.on(key, callback);
  }

  off(event: string, callback: (data: any) => void) {
    this.socket.off(event, callback);
  }

  emit(event: string, data: any) {
    this.socket.emit(event, data);
  }

  updateProperties({ room }: { room: any }) {
    this.socket.conn.updateProperties({
      room: room,
      host: this.options.host
    })
  }

  async reconnect(listeners?: (data: any) => void) {
   this.socket.conn.reconnect()
  }
}

class UpdateMapStandaloneService extends UpdateMapService {
  constructor(protected context: Context, private options: MmorpgOptions) {
    super(context);
  }

  async update(map: any) {
    // nothing
  }
}

export function provideMmorpg(options: MmorpgOptions) {
  return [
    {
      provide: WebSocketToken,
      useFactory: (context: Context) => new BridgeWebsocket(context, options),
    },
    {
      provide: UpdateMapToken,
      useFactory: (context: Context) => new UpdateMapStandaloneService(context, options),
    },
    RpgGui,
    RpgClientEngine,
  ];
}
