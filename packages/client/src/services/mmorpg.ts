import { Context } from "@signe/di";
import { connectionRoom } from "@signe/sync/client";
import { RpgGui } from "../Gui/Gui";
import { RpgClientEngine } from "../RpgClientEngine";
import { AbstractWebsocket, SocketUpdateProperties, WebSocketToken } from "./AbstractSocket";
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
  private targetRoom = "lobby-1";

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
    const host = this.options.host || window.location.host;
    this.socket = await connectionRoom({
        host,
        room: this.targetRoom,
        id: this.privateId,
        query: {
          id: this.privateId,
        },
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

  updateProperties({ room, host, query }: SocketUpdateProperties) {
    if (!this.socket?.conn) return;
    this.targetRoom = room;
    this.socket.conn.updateProperties({
      room,
      id: this.privateId,
      host: host || this.options.host || window.location.host,
      query: {
        ...query,
        id: this.privateId,
      },
    })
  }

  private waitForNextOpen(conn: any, timeoutMs = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      let timeoutId: number | undefined;
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("WebSocket reconnect failed"));
      };
      const cleanup = () => {
        conn.removeEventListener("open", onOpen);
        conn.removeEventListener("error", onError);
        if (timeoutId !== undefined) {
          window.clearTimeout(timeoutId);
        }
      };

      conn.addEventListener("open", onOpen);
      conn.addEventListener("error", onError);
      timeoutId = window.setTimeout(() => {
        cleanup();
        reject(new Error("WebSocket reconnect timeout"));
      }, timeoutMs);
    });
  }

  async reconnect(_listeners?: (data: any) => void): Promise<void> {
    if (!this.socket?.conn) return;
    const conn = this.socket.conn;
    const opened = this.waitForNextOpen(conn);
    conn.reconnect();
    await opened;
  }

  getCurrentRoom(): string {
    return this.targetRoom || this.socket?.conn?.room || "lobby-1";
  }
}

class UpdateMapStandaloneService extends UpdateMapService {
  constructor(protected context: Context, private _options: MmorpgOptions) {
    super(context);
  }

  async update(_map: any) {
    // In MMORPG mode, clients are untrusted and must not push map definitions.
    // Map bootstrap/update is handled server-side by @rpgjs/vite.
    return;
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
