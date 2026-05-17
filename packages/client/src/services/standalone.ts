import { AbstractWebsocket, SocketUpdateProperties, WebSocketToken } from "./AbstractSocket";
import { ClientIo, ServerIo } from "@signe/room";
import { Context } from "@signe/di";
import { RpgClientEngine } from "../RpgClientEngine";
import { UpdateMapService, UpdateMapToken } from "@rpgjs/common";
import { LoadMapToken } from "./loadMap";
import { RpgGui } from "../Gui/Gui";
import { provideKeyboardControls } from "./keyboardControls";
import { provideSaveClient } from "./save";
import { normalizeStandaloneMessage } from "./standalone-message";

type ServerIo = any;
type ClientIo = any;

interface StandaloneOptions {
  env?: Record<string, any>;
}

class BridgeWebsocket extends AbstractWebsocket {
  private room: ServerIo;
  private socket: ClientIo;
  private pendingOn: Array<{ event: string; callback: (data: any) => void }> = [];
  private rooms = {
    partyFn: async (roomId: string) => {
      this.room = new ServerIo(roomId, this.rooms);
      const server = new this.server(this.room)
      await server.onStart();
      await server.subRoom.onStart()
      this.context.set('server', server)
      return server
    },
    env: {}
  }
  private serverInstance: any;

  constructor(protected context: Context, private server: any, options: StandaloneOptions = {}) {
    super(context);
    // fake room
    this.rooms.env = options.env || {};
    this.room = new ServerIo("lobby-1", this.rooms);
  }

  async connection(listeners?: (data: any) => void) {
    this.serverInstance = new this.server(this.room);
    await this.serverInstance.onStart();
    await this.serverInstance.subRoom.onStart()
    this.context.set('server', this.serverInstance)
    return this._connection(listeners)
  }

  private async _connection(listeners?: (data: any) => void) {
    this.serverInstance = this.context.get('server')
    this.socket = new ClientIo(this.serverInstance, 'player-client-id');
    const url = new URL('http://localhost')
    const request = new Request(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    listeners?.(this.socket)
    await this.serverInstance.onConnect(this.socket.conn as any, { request } as any);
    this.room.clients.set(this.socket.id, this.socket);
    this.pendingOn.forEach(({ event, callback }) => this.socket.addEventListener(event, callback));
    this.pendingOn = [];
    return this.socket
  }

  on(key: string, callback: (data: any) => void) {
    const handler = (event) => {
      const object = normalizeStandaloneMessage(event);
      if (object.type === key) {
        callback(object.value);
      }
    };
    if (!this.socket) {
      this.pendingOn.push({ event: "message", callback: handler });
      return;
    }
    this.socket.addEventListener("message", handler);
  }

  off(event: string, callback: (data: any) => void) {
    if (!this.socket) return;
    this.socket.removeEventListener(event, callback);
  }

  emit(event: string, data: any) {
    this.socket.send({
      action: event,
      value: data,
    });
  }

  /**
   * Update underlying connection properties before a reconnect
   *
   * Design
   * - Dynamically register a factory for the requested room to ensure a fresh server instance
   * - Swap the internal ServerIo to target the new room
   *
   * @param params - Properties to update
   * @param params.room - The target room id (e.g. `map-simplemap2`)
   *
   * @example
   * ```ts
   * websocket.updateProperties({ room: 'map-simplemap2' })
   * await websocket.reconnect()
   * ```
   */
  updateProperties(_params: SocketUpdateProperties) {
    // empty
  }

  /**
   * Reconnect the client to the current Party room
   *
   * Design
   * - Must be called after `updateProperties()` when switching rooms
   * - Rebuilds the client <-> server bridge and re-triggers connection listeners
   *
   * @param listeners - Optional callback to re-bind event handlers on the new socket
   *
   * @example
   * ```ts
   * websocket.updateProperties({ room: 'map-dungeon' })
   * await websocket.reconnect((socket) => {
   *   // re-bind events here
   * })
   * ```
   */
  async reconnect(listeners?: (data: any) => void): Promise<void> {
    await this._connection((socket) => {
      listeners?.(socket)
    })
  }

  getServer() {
    return this.serverInstance
  }

  getSocket() {
    return this.socket
  }
}

class UpdateMapStandaloneService extends UpdateMapService {
  private server: any;

  /**
   * Update the current room map data on the server side
   *
   * Design
   * - Uses the in-memory server instance stored in context (standalone mode)
   * - Builds a local HTTP-like request to the current Party room endpoint
   *
   * @param map - The map payload to apply on the server
   *
   * @example
   * ```ts
   * await updateMapService.update({ width: 1024, height: 768, events: [] })
   * ```
   */
  async update(map: any) {
    this.server = this.context.get('server')
    const roomId = this.server?.room?.id ?? 'lobby-1'
    const req = {
      url: `http://localhost/parties/main/${roomId}/map/update`,
      method: 'POST',
      headers: new Headers({}),
      json: async () => {
        return map;
      }
    };
    await this.server.onRequest(req)
  }
}

export function provideRpg(server: any, options: StandaloneOptions = {}) {
  return [
    {
      provide: WebSocketToken,
      useFactory: (context: Context) => new BridgeWebsocket(context, server, options),
    },
    {
      provide: UpdateMapToken,
      useClass: UpdateMapStandaloneService,
    },
    provideKeyboardControls(),
    provideSaveClient(),
    RpgGui,
    RpgClientEngine,
  ];
}
