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
   * Sends data to the client via WebSocket
   *
   * @param {any} data - Data to send (automatically serialized to JSON if not string)
   */
  send(data: any): void {
    if (this.ws.readyState === 1) {
      // WebSocket.OPEN
      const message = typeof data === "string" ? data : JSON.stringify(data);
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
   * Broadcasts a message to all connected clients
   *
   * @param {any} message - Message to broadcast
   * @param {string[]} except - Array of connection IDs to exclude from broadcast
   */
  broadcast(message: any, except: string[] = []): void {
    const data =
      typeof message === "string" ? message : JSON.stringify(message);

    for (const [connectionId, connection] of this.connections) {
      if (!except.includes(connectionId)) {
        connection.send(data);
      }
    }
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
        return Array.from(this.storageData.keys());
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

                    // Get or create the room
                    let room = rooms.get(roomName);
                    if (!room) {
                      room = new Room(roomName);
                      rooms.set(roomName, room);
                      console.log(`Created new room: ${roomName}`);
                    }

                    // Get or create the server for this room
                    let rpgServer = servers.get(roomName);
                    if (!rpgServer) {
                      rpgServer = new serverModule(room);
                      servers.set(roomName, rpgServer);
                      console.log(`Created new server instance for room: ${roomName}`);
                      
                      // Call onStart on the new server instance
                      if (typeof rpgServer.onStart === "function") {
                        try {
                          await rpgServer.onStart();
                          console.log(`Server started for room: ${roomName}`);
                        } catch (error) {
                          console.error(`Error starting server for room ${roomName}:`, error);
                        }
                      }
                    }

                    // Create a connection instance
                    const connection = new PartyConnection(
                      ws,
                      undefined,
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
                          url: request.url,
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
