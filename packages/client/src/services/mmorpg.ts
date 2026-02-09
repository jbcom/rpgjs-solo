import { Context } from "@signe/di";
import { connectionRoom } from "@signe/sync/client";
import { RpgGui } from "../Gui/Gui";
import { RpgClientEngine } from "../RpgClientEngine";
import { AbstractWebsocket, WebSocketToken } from "./AbstractSocket";
import { UpdateMapService, UpdateMapToken } from "@rpgjs/common";
import { provideKeyboardControls } from "./keyboardControls";
import { provideSaveClient } from "./save";

interface MmorpgOptions {
    host?: string;
    connectionId?: string;
    connectionIdScope?: "local" | "session" | "ephemeral";
}

class BridgeWebsocket extends AbstractWebsocket {
  private socket: any;
  private privateId: string;
  private pendingOn: Array<{ event: string; callback: (data: any) => void }> = [];

  constructor(protected context: Context, private options: MmorpgOptions = {}) {
    super(context);
    this.privateId = this.resolveConnectionId();
  }

  private resolveConnectionId(): string {
    if (this.options.connectionId) {
      return this.options.connectionId;
    }

    const scope = this.options.connectionIdScope ?? "local";
    const key = "rpgjs-user-id";

    if (scope === "ephemeral") {
      return crypto.randomUUID();
    }

    const storage =
      scope === "session"
        ? window.sessionStorage
        : window.localStorage;

    const existing = storage.getItem(key);
    if (existing) {
      return existing;
    }

    const id = crypto.randomUUID();
    storage.setItem(key, id);
    return id;
  }

  async connection(listeners?: (data: any) => void) {
    // tmp
    class Room {
        
    }
    const instance = new Room()
    this.socket = await connectionRoom({
        host: this.options.host || window.location.host,
        room: "lobby-1",
        id: this.privateId
    }, instance)

    listeners?.(this.socket)
    this.pendingOn.forEach(({ event, callback }) => this.socket.on(event, callback));
    this.pendingOn = [];
  }

  on(key: string, callback: (data: any) => void) {
    if (!this.socket) {
      this.pendingOn.push({ event: key, callback });
      return;
    }
    this.socket.on(key, callback);
  }

  off(event: string, callback: (data: any) => void) {
    if (!this.socket) return;
    this.socket.off(event, callback);
  }

  emit(event: string, data: any) {
    this.socket.emit(event, data);
  }

  updateProperties({ room }: { room: any }) {
    this.socket.conn.updateProperties({
      room: room,
      id: this.privateId,
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
    provideKeyboardControls(),
    provideSaveClient(),
    RpgGui,
    RpgClientEngine,
  ];
}
