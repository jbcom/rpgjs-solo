import { RpgServerEngine } from "@rpgjs/server";
import type { ViteDevServer } from "vite";
import { IncomingMessage } from "http";
import { Duplex } from "stream";

// Types for WebSocket without importing ws directly
interface WSConnection {
  readyState: number;
  send(data: string): void;
  close(): void;
  on(event: string, callback: (...args: any[]) => void): void;
}

interface WSServer {
  handleUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    callback: (ws: WSConnection) => void
  ): void;
  close(): void;
}

/**
 * PartyConnection class compatible with PartyKit's Party.Connection interface
 *
 * This class implements the Connection interface expected by RPG-JS server,
 * providing WebSocket communication capabilities and connection state management.
 * Includes optional packet loss simulation for testing network conditions.
 *
 * @example
 * ```typescript
 * const connection = new PartyConnection(websocket, 'player123');
 * connection.send('Hello player!');
 * connection.setState({ username: 'Alice' });
 * ```
 */
class PartyConnection {
  public id: string;
  public uri: string;
  private _state: any = {};
  public static packetLossRate: number = parseFloat(process.env.RPGJS_PACKET_LOSS_RATE || '0.1');
  public static packetLossEnabled: boolean = process.env.RPGJS_ENABLE_PACKET_LOSS === 'true';
  public static packetLossFilter: string = process.env.RPGJS_PACKET_LOSS_FILTER || '';
  public static latencyEnabled: boolean = process.env.RPGJS_ENABLE_LATENCY === 'true';
  public static latencyMinMs: number = parseInt(process.env.RPGJS_LATENCY_MIN_MS || '50');
  public static latencyMaxMs: number = parseInt(process.env.RPGJS_LATENCY_MAX_MS || '200');
  public static latencyFilter: string = process.env.RPGJS_LATENCY_FILTER || 'sync';

  constructor(private ws: WSConnection, id?: string, uri?: string) {
    this.id = id || this.generateId();
    this.uri = uri || "";
  }

  /**
   * Generates a unique identifier for the connection
   *
   * @returns {string} Unique identifier based on timestamp and random number
   */
  private generateId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sends data to the client via WebSocket with optional latency simulation
   *
   * @param {any} data - Data to send (automatically serialized to JSON if not string)
   */
  async send(data: any): Promise<void> {
    if (this.ws.readyState === 1) {
      // WebSocket.OPEN
      const message = typeof data === "string" ? data : JSON.stringify(data);
      
      // Check if latency simulation is enabled
      if (PartyConnection.latencyEnabled && PartyConnection.latencyMaxMs > 0) {
        // Apply filter if specified (only simulate latency for messages containing the filter string)
        if (PartyConnection.latencyFilter && !message.includes(PartyConnection.latencyFilter)) {
          // Message doesn't match filter, send immediately
          this.ws.send(message);
          return;
        }
        
        // Calculate random latency between min and max
        const latencyMs = Math.random() * (PartyConnection.latencyMaxMs - PartyConnection.latencyMinMs) + PartyConnection.latencyMinMs;
        
        console.log(`\x1b[34m[LATENCY SIMULATION]\x1b[0m Connection ${this.id}: Delaying message by ${latencyMs.toFixed(1)}ms`);
        console.log(`\x1b[33m[MESSAGE DATA]\x1b[0m ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);
        
        // Delay the message
        await new Promise(resolve => setTimeout(resolve, latencyMs));
      }
      
      this.ws.send(message);
    }
  }

  /**
   * Closes the WebSocket connection
   */
  close(): void {
    if (this.ws.readyState === 1) {
      // WebSocket.OPEN
      this.ws.close();
    }
  }

  /**
   * Sets state data for this connection
   *
   * @param {any} value - State data to store (max 2KB as per PartyKit spec)
   */
  setState(value: any): void {
    this._state = value;
  }

  /**
   * Gets the current state of this connection
   *
   * @returns {any} Current connection state
   */
  get state(): any {
    return this._state;
  }

  /**
   * Configures packet loss simulation settings
   * 
   * @param {boolean} enabled - Whether to enable packet loss simulation
   * @param {number} rate - Packet loss rate (0.0 to 1.0, e.g., 0.1 = 10% loss)
   * @param {string} filter - Optional filter string to only simulate loss for messages containing this string
   * 
   * @example
   * ```typescript
   * PartyConnection.configurePacketLoss(true, 0.15); // 15% packet loss
   * PartyConnection.configurePacketLoss(true, 0.2, 'sync'); // 20% loss only for sync messages
   * ```
   */
  static configurePacketLoss(enabled: boolean, rate: number, filter?: string): void {
    PartyConnection.packetLossEnabled = enabled;
    PartyConnection.packetLossRate = Math.max(0, Math.min(1, rate)); // Clamp between 0 and 1
    PartyConnection.packetLossFilter = filter || '';
    
    if (enabled && rate > 0) {
      const filterInfo = filter ? ` (filtered: "${filter}")` : '';
      console.log(`\x1b[35m[PACKET LOSS SIMULATION]\x1b[0m Enabled with ${(rate * 100).toFixed(1)}% loss rate${filterInfo}`);
    } else if (enabled) {
      console.log(`\x1b[35m[PACKET LOSS SIMULATION]\x1b[0m Enabled but rate is 0% (no messages will be dropped)`);
    } else {
      console.log(`\x1b[35m[PACKET LOSS SIMULATION]\x1b[0m Disabled`);
    }
  }

  /**
   * Gets current packet loss simulation status
   * 
   * @returns {Object} Current configuration
   */
  static getPacketLossStatus(): { enabled: boolean; rate: number; filter: string } {
    return {
      enabled: PartyConnection.packetLossEnabled,
      rate: PartyConnection.packetLossRate,
      filter: PartyConnection.packetLossFilter
    };
  }

  /**
   * Configures latency simulation settings
   * 
   * @param {boolean} enabled - Whether to enable latency simulation
   * @param {number} minMs - Minimum latency in milliseconds
   * @param {number} maxMs - Maximum latency in milliseconds
   * @param {string} filter - Optional filter string to only simulate latency for messages containing this string
   * 
   * @example
   * ```typescript
   * PartyConnection.configureLatency(true, 100, 300); // 100-300ms latency
   * PartyConnection.configureLatency(true, 50, 150, 'sync'); // 50-150ms latency only for sync messages
   * ```
   */
  static configureLatency(enabled: boolean, minMs: number, maxMs: number, filter?: string): void {
    PartyConnection.latencyEnabled = enabled;
    PartyConnection.latencyMinMs = Math.max(0, minMs);
    PartyConnection.latencyMaxMs = Math.max(PartyConnection.latencyMinMs, maxMs);
    PartyConnection.latencyFilter = filter || '';
    
    if (enabled && maxMs > 0) {
      const filterInfo = filter ? ` (filtered: "${filter}")` : '';
      console.log(`\x1b[35m[LATENCY SIMULATION]\x1b[0m Enabled with ${minMs}-${maxMs}ms latency range${filterInfo}`);
    } else if (enabled) {
      console.log(`\x1b[35m[LATENCY SIMULATION]\x1b[0m Enabled but max latency is 0ms (no delay will be applied)`);
    } else {
      console.log(`\x1b[35m[LATENCY SIMULATION]\x1b[0m Disabled`);
    }
  }

  /**
   * Gets current latency simulation status
   * 
   * @returns {Object} Current configuration
   */
  static getLatencyStatus(): { enabled: boolean; minMs: number; maxMs: number; filter: string } {
    return {
      enabled: PartyConnection.latencyEnabled,
      minMs: PartyConnection.latencyMinMs,
      maxMs: PartyConnection.latencyMaxMs,
      filter: PartyConnection.latencyFilter
    };
  }
}

/**
 * Room class compatible with PartyKit's Party.Room interface
 *
 * This class manages multiple WebSocket connections and provides broadcasting
 * capabilities, storage, and connection management as expected by RPG-JS server.
 *
 * @example
 * ```typescript
 * const room = new Room('lobby-1');
 * room.broadcast('Game started!');
 * const playerCount = [...room.getConnections()].length;
 * ```
 */
class Room {
  public id: string;
  public internalID: string;
  public env: Record<string, any> = {};
  public context: any = {};
  private connections: Map<string, PartyConnection> = new Map();
  private storageData: Map<string, any> = new Map();

  constructor(id: string) {
    this.id = id;
    this.internalID = `internal_${id}_${Date.now()}`;
  }

  /**
   * Broadcasts a message to all connected clients with optional latency simulation
   *
   * @param {any} message - Message to broadcast
   * @param {string[]} except - Array of connection IDs to exclude from broadcast
   */
  async broadcast(message: any, except: string[] = []): Promise<void> {
    const data =
      typeof message === "string" ? message : JSON.stringify(message);

    const sendPromises: Promise<void>[] = [];
    
    for (const [connectionId, connection] of this.connections) {
      if (!except.includes(connectionId)) {
        sendPromises.push(connection.send(data));
      }
    }
    
    // Wait for all messages to be sent (with potential latency delays)
    await Promise.all(sendPromises);
  }

  /**
   * Gets a connection by its ID
   *
   * @param {string} id - Connection ID
   * @returns {PartyConnection | undefined} The connection or undefined if not found
   */
  getConnection(id: string): PartyConnection | undefined {
    return this.connections.get(id);
  }

  /**
   * Gets all currently connected clients
   *
   * @param {string} tag - Optional tag to filter connections (not implemented yet)
   * @returns {IterableIterator<PartyConnection>} Iterator of all connections
   */
  getConnections(tag?: string): IterableIterator<PartyConnection> {
    // TODO: Implement tag filtering if needed
    return this.connections.values();
  }

  /**
   * Adds a connection to this room
   *
   * @param {PartyConnection} connection - Connection to add
   */
  addConnection(connection: PartyConnection): void {
    this.connections.set(connection.id, connection);
  }

  /**
   * Removes a connection from this room
   *
   * @param {string} connectionId - ID of connection to remove
   */
  removeConnection(connectionId: string): void {
    this.connections.delete(connectionId);
  }

  /**
   * Simple key-value storage for the room
   */
  get storage() {
    return {
      put: async (key: string, value: any) => {
        this.storageData.set(key, value);
      },
      get: async <T = any>(key: string): Promise<T | undefined> => {
        return this.storageData.get(key) as T;
      },
      delete: async (key: string) => {
        this.storageData.delete(key);
      },
      list: async () => {
        // Return entries to match expected PartyKit/Server semantics
        // Consumers often iterate as: for (const [key, value] of await storage.list())
        return Array.from(this.storageData.entries());
      },
    };
  }
}

/**
 * Utility function to safely import WebSocketServer
 *
 * This function checks if we are in a Node.js environment
 * before trying to import the ws module, thus avoiding
 * browser compatibility errors.
 *
 * @returns {Promise<any>} The WebSocketServer class or null if not available
 */
async function importWebSocketServer(): Promise<any> {
  // Check if we are in a Node.js environment
  if (typeof process === "undefined" || !process.versions?.node) {
    console.warn("Not in Node.js environment, WebSocket server not available");
    return null;
  }

  try {
    // Use createRequire to import ws in an ES module context
    const { createRequire } = await import("module");
    const require = createRequire(import.meta.url);
    const ws = require("ws");
    return ws.WebSocketServer || ws.default?.WebSocketServer || ws;
  } catch (error) {
    console.warn("Failed to load ws module:", error);
    return null;
  }
}

async function updateMap(roomId: string, rpgServer: RpgServerEngine) {
  try {
    const mapId = roomId.startsWith('map-') ? roomId.slice(4) : roomId;
    const defaultMapPayload = {
      id: mapId,
      width: 1000,
      height: 1000,
      events: [] as any[],
    };

    const req = {
      url: `http://localhost/parties/main/${roomId}/map/update`,
      method: 'POST',
      headers: new Headers({}),
      json: async () => defaultMapPayload,
      text: async () => JSON.stringify(defaultMapPayload)
    } as any;

    await (rpgServer as any).onRequest(req);
    console.log(`Initialized map for room ${roomId} via POST /map/update`);
  } catch (error) {
    console.warn(`Failed initializing map for room ${roomId}:`, error);
  }
}

/**
 * Creates a Vite plugin for integrating RPG-JS server functionality
 *
 * This plugin configures the development server to automatically start
 * an RPG-JS server instance when Vite's dev server starts. It handles
 * the instantiation and initialization of the server module, and sets up
 * HTTP request and WebSocket connection forwarding to the RPG-JS server.
 *
 * The plugin intercepts:
 * - HTTP requests to `/parties/*` paths and forwards them to the RPG-JS server
 * - WebSocket upgrade requests and establishes connections with the RPG-JS server
 *
 * @param {new () => RpgServerEngine} serverModule - A class constructor that extends RpgServerEngine
 * @returns {Object} Vite plugin configuration object
 *
 * @example
 * ```typescript
 * // In vite.config.ts
 * import { serverPlugin } from '@rpgjs/vite';
 * import startServer from './src/server';
 *
 * export default defineConfig({
 *   plugins: [
 *     serverPlugin(startServer)
 *   ]
 * });
 * ```
 */
export function serverPlugin(
  serverModule: new (room: Room) => RpgServerEngine
) {
  let wsServer: WSServer | null = null;
  let rooms: Map<string, Room> = new Map();
  let servers: Map<string, RpgServerEngine> = new Map();

  // Ensure a room and its server instance exist for a given roomId
  async function ensureRoomAndServer(roomId: string) {
    let room = rooms.get(roomId);
    if (!room) {
      room = new Room(roomId);
      rooms.set(roomId, room);
      console.log(`Created new room: ${roomId}`);
    }
    let rpgServer = servers.get(roomId);
    if (!rpgServer) {
      rpgServer = new serverModule(room);
      servers.set(roomId, rpgServer);
      console.log(`Created new server instance for room: ${roomId}`);
      if (typeof rpgServer.onStart === "function") {
        try {
          await rpgServer.onStart();
          console.log(`Server started for room: ${roomId}`);
        } catch (error) {
          console.error(`Error starting server for room ${roomId}:`, error);
        }
      }

      await updateMap(roomId, rpgServer);
    }
    
    // Make sure parties context is available on the room
    room.context.parties = buildPartiesContext();
    return { room, rpgServer };
  }

  // Build a parties context compatible with "room.context.parties"
  function buildPartiesContext() {
    return {
      main: {
        get: async (targetRoomId: string) => {
          const { rpgServer } = await ensureRoomAndServer(targetRoomId);
          return {
            fetch: async (path: string, init?: { method?: string; body?: any; headers?: Record<string, string> }) => {
              try {
                const url = `http://localhost/parties/main/${targetRoomId}${path}`;
                const method = (init?.method || 'GET').toUpperCase();
                const headers = new Headers(init?.headers || {});
                const bodyRaw = init?.body;

                const req = {
                  url,
                  method,
                  headers,
                  json: async () => {
                    if (!bodyRaw) return undefined as any;
                    return typeof bodyRaw === 'string' ? JSON.parse(bodyRaw) : bodyRaw;
                  },
                  text: async () => {
                    if (typeof bodyRaw === 'string') return bodyRaw;
                    if (typeof bodyRaw === 'undefined') return '';
                    return JSON.stringify(bodyRaw);
                  }
                } as any;

                const result = await (rpgServer as any).onRequest(req);
                const ok = !!result && (result.ok === true || typeof result !== 'undefined');
                const response = {
                  ok,
                  status: ok ? 200 : 404,
                  async json() {
                    if (result && typeof result.json === 'function') return result.json();
                    return result ?? {};
                  },
                  async text() {
                    if (typeof result === 'string') return result;
                    try { return JSON.stringify(result ?? {}); } catch { return ''; }
                  }
                } as any;
                return response;
              } catch (error) {
                return {
                  ok: false,
                  status: 500,
                  async json() {
                    return { error: (error as Error)?.message || 'Internal error' };
                  },
                  async text() {
                    return (error as Error)?.message || 'Internal error';
                  }
                } as any;
              }
            }
          };
        }
      }
    } as any;
  }

  return {
    name: "server-plugin",

    async configureServer(server: ViteDevServer) {
      // Dynamic import of WebSocketServer to avoid compatibility issues
      try {
        const WebSocketServerClass = await importWebSocketServer();
        if (WebSocketServerClass) {
          wsServer = new WebSocketServerClass({
            noServer: true,
          });
          console.log("WebSocket server initialized successfully");
        } else {
          console.log("WebSocket server not available in this environment");
        }
      } catch (error) {
        console.warn("WebSocket server not available:", error);
        wsServer = null;
      }

      console.log('RPG-JS server plugin initialized');
      
      // Display network simulation status
      const packetLossStatus = PartyConnection.getPacketLossStatus();
      const latencyStatus = PartyConnection.getLatencyStatus();
      
      if (packetLossStatus.enabled) {
        const filterInfo = packetLossStatus.filter ? ` (filter: "${packetLossStatus.filter}")` : '';
        console.log(`\x1b[36m[NETWORK SIMULATION]\x1b[0m Packet loss simulation: ${(packetLossStatus.rate * 100).toFixed(1)}% loss rate${filterInfo}`);
      } else {
        console.log(`\x1b[36m[NETWORK SIMULATION]\x1b[0m Packet loss simulation: disabled`);
      }
      
      if (latencyStatus.enabled) {
        const filterInfo = latencyStatus.filter ? ` (filter: "${latencyStatus.filter}")` : '';
        console.log(`\x1b[36m[NETWORK SIMULATION]\x1b[0m Latency simulation: ${latencyStatus.minMs}-${latencyStatus.maxMs}ms range${filterInfo}`);
      } else {
        console.log(`\x1b[36m[NETWORK SIMULATION]\x1b[0m Latency simulation: disabled`);
      }

      // HTTP request interception for /parties/* routes
      server.middlewares.use("/parties", async (req, res, next) => {
        try {
          // For now, pass to the next middleware
          // The RPG-JS server handles its own routes via @signe/room
          console.log(`RPG-JS HTTP request: ${req.method} ${req.url}`);

          // Create a basic response for test routes
          if (req.url?.includes("/test")) {
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                message: "RPG-JS server is running",
                timestamp: new Date().toISOString(),
              })
            );
            return;
          }

          next();
        } catch (error) {
          console.error("Error handling RPG-JS request:", error);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      });
      // WebSocket upgrade handling (if available)
      if (wsServer) {
        server.httpServer?.on(
          "upgrade",
          (request: IncomingMessage, socket: Duplex, head: Buffer) => {
            const url = new URL(request.url!, `http://${request.headers.host}`);

            // Check if it's a WebSocket connection for RPG-JS
            if (url.pathname.startsWith("/parties/")) {
              console.log(`WebSocket upgrade request: ${url.pathname}`);

              wsServer!.handleUpgrade(
                request,
                socket,
                head,
                async (ws: WSConnection) => {
                  try {
                    // Extract room name from URL: /parties/main/lobby-1 -> lobby-1
                    const pathParts = url.pathname.split("/");
                    const roomName = pathParts[pathParts.length - 1]; // Get the last part (lobby-1)

                    // Extract query parameters (like _pk)
                    const queryParams = Object.fromEntries(
                      url.searchParams.entries()
                    );
                    console.log(
                      `Room: ${roomName}, Query params:`,
                      queryParams
                    );

                    // Get or create the room and its server
                    const ensured = await ensureRoomAndServer(roomName);
                    const room = ensured.room;
                    const rpgServer = ensured.rpgServer;
                    // Inject a compatible parties context for cross-room calls
                    room.context.parties = buildPartiesContext();
                    
                    // Create a connection instance
                    const connection = new PartyConnection(
                      ws,
                      queryParams._pk,
                      request.url
                    );

                    // Add connection to the room
                    room.addConnection(connection);

                    console.log(
                      `WebSocket connection established: ${connection.id} in room: ${roomName}`
                    );

                    // Set up WebSocket event handlers
                    ws.on("message", async (data: Buffer) => {
                      try {
                        const message = data.toString();
                        
                        // Check if packet loss simulation is enabled for incoming messages
                        if (PartyConnection.packetLossEnabled && PartyConnection.packetLossRate > 0) {
                          // Apply filter if specified (only simulate loss for messages containing the filter string)
                          if (PartyConnection.packetLossFilter && !message.includes(PartyConnection.packetLossFilter)) {
                            // Message doesn't match filter, process normally
                            if (typeof rpgServer.onMessage === "function") {
                              await rpgServer.onMessage(message, connection as any);
                            }
                            return;
                          }
                          
                          const random = Math.random();
                          
                          if (random < PartyConnection.packetLossRate) {
                            // Simulate packet loss (server won't process this message)
                            console.log(`\x1b[31m[PACKET LOSS]\x1b[0m Connection ${connection.id}: Server won't receive this message (${(PartyConnection.packetLossRate * 100).toFixed(1)}% loss rate)`);
                            console.log(`\x1b[33m[PACKET DATA]\x1b[0m ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);
                            return; // Don't process the message
                          } else {
                            // Message will be processed by server
                            console.log(`\x1b[32m[PACKET RECEIVED]\x1b[0m Connection ${connection.id}: Server will process this message`);
                          }
                        }
                        
                        // Call onMessage on the RPG-JS server
                        if (typeof rpgServer.onMessage === "function") {
                          await rpgServer.onMessage(message, connection as any);
                        }
                      } catch (error) {
                        console.error(
                          "Error processing WebSocket message:",
                          error
                        );
                      }
                    });

                    ws.on("close", async () => {
                      console.log(
                        `WebSocket connection closed: ${connection.id} from room: ${roomName}`
                      );
                      // Remove connection from room
                      room.removeConnection(connection.id);
                      // Call onClose on the RPG-JS server
                      if (typeof rpgServer.onClose === "function") {
                        await rpgServer.onClose(connection as any);
                      }
                    });

                    ws.on("error", async (error: Error) => {
                      console.error("WebSocket error:", error);
                      // Remove connection from room
                      room.removeConnection(connection.id);
                      // Call onClose on the RPG-JS server
                      if (typeof rpgServer.onClose === "function") {
                        await rpgServer.onClose(connection as any);
                      }
                    });

                    // Call onConnect on the RPG-JS server if the method exists
                    if (typeof rpgServer.onConnect === "function") {
                      // Create a compatible connection context with Headers-like interface
                      const headers = new Map();
                      if (request.headers) {
                        Object.entries(request.headers).forEach(
                          ([key, value]) => {
                            headers.set(
                              key.toLowerCase(),
                              Array.isArray(value) ? value[0] : value
                            );
                          }
                        );
                      }

                      const connectionContext = {
                        request: {
                          headers: {
                            has: (name: string) =>
                              headers.has(name.toLowerCase()),
                            get: (name: string) =>
                              headers.get(name.toLowerCase()),
                            entries: () => headers.entries(),
                            keys: () => headers.keys(),
                            values: () => headers.values(),
                          },
                           url: url.toString(),
                          method: request.method,
                        },
                        url: url,
                      };
                      await rpgServer.onConnect(
                        connection as any,
                        connectionContext as any
                      );
                    }

                    // Send connection confirmation
                    connection.send({
                      type: "connected",
                      id: connection.id,
                      message: "Connected to RPG-JS server",
                    });
                  } catch (error) {
                    console.error(
                      "Error establishing WebSocket connection:",
                      error
                    );
                    ws.close();
                  }
                }
              );
            }
          }
        );
      }

      console.log(
        "RPG-JS server plugin configured with HTTP and WebSocket forwarding"
      );
    },

    buildStart() {
      console.log("RPG-JS server starting...");
    },

    buildEnd() {
      // Cleanup when server stops
      if (wsServer) {
        wsServer.close();
      }
      console.log("RPG-JS server stopped");
    },
  };
}
