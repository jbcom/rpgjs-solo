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
  private messageQueue: Array<{ message: string; timestamp: number; sequence: number }> = [];
  private isProcessingQueue: boolean = false;
  private sequenceCounter: number = 0;
  private incomingQueue: Array<{
    message: string;
    timestamp: number;
    processor: (messages: string[]) => Promise<void>;
  }> = [];
  private isProcessingIncomingQueue: boolean = false;
  public static packetLossRate: number = parseFloat(process.env.RPGJS_PACKET_LOSS_RATE || '0.1');
  public static packetLossEnabled: boolean = process.env.RPGJS_ENABLE_PACKET_LOSS === 'true';
  public static packetLossFilter: string = process.env.RPGJS_PACKET_LOSS_FILTER || '';
  public static bandwidthEnabled: boolean = process.env.RPGJS_ENABLE_BANDWIDTH === 'true';
  public static bandwidthKbps: number = parseInt(process.env.RPGJS_BANDWIDTH_KBPS || '100'); // Kilobits per second
  public static bandwidthFilter: string = process.env.RPGJS_BANDWIDTH_FILTER || '';
  public static latencyEnabled: boolean = process.env.RPGJS_ENABLE_LATENCY === 'true';
  public static latencyMs: number = parseInt(process.env.RPGJS_LATENCY_MS || '50'); // Fixed latency in milliseconds
  public static latencyFilter: string = process.env.RPGJS_LATENCY_FILTER || '';

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
   * Sends data to the client via WebSocket with bandwidth and latency simulation
   *
   * Messages are queued and sent in the order they were called, with bandwidth limitations
   * and network latency that simulate a slow, distant network connection. This ensures that 
   * if send(A) is called before send(B), A will always be sent before B, but both will be 
   * slowed down by bandwidth constraints and network latency.
   *
   * @param {any} data - Data to send (automatically serialized to JSON if not string)
   */
  async send(data: any): Promise<void> {
    if (this.ws.readyState !== 1) {
      // WebSocket not open
      return;
    }

    const message = typeof data === "string" ? data : JSON.stringify(data);
    const timestamp = Date.now();
    const sequence = ++this.sequenceCounter;

    // Add message to queue
    this.messageQueue.push({ message, timestamp, sequence });

    // Start processing queue if not already processing
    if (!this.isProcessingQueue) {
      this.processMessageQueue();
    }
  }

  /**
   * Processes the outgoing queue in order.
   *
   * Each message receives its own fixed latency (if enabled), while preserving
   * original spacing and order.
   */
  private async processMessageQueue(): Promise<void> {
    await this.flushSendQueue();
  }

  /**
   * Flushes the send queue sequentially, respecting bandwidth constraints.
   */
  private async flushSendQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    while (this.messageQueue.length > 0) {
      const queueItem = this.messageQueue.shift()!;

      // Apply fixed one-way latency per message (not batched bursts).
      if (this.shouldApplyLatency(queueItem.message)) {
        await this.waitUntil(queueItem.timestamp + PartyConnection.latencyMs);
      }

      // Bandwidth simulation per message
      if (PartyConnection.bandwidthEnabled && PartyConnection.bandwidthKbps > 0) {
        if (!PartyConnection.bandwidthFilter || queueItem.message.includes(PartyConnection.bandwidthFilter)) {
          const messageSizeBits = queueItem.message.length * 8;
          const transmissionTimeMs = (messageSizeBits / (PartyConnection.bandwidthKbps * 1000)) * 1000;
          const minDelayMs = 10;
          const bandwidthDelayMs = Math.max(transmissionTimeMs, minDelayMs);
          console.log(`\x1b[34m[BANDWIDTH SIMULATION]\x1b[0m Connection ${this.id}: Message #${queueItem.sequence} transmission time: ${bandwidthDelayMs.toFixed(1)}ms`);
          await new Promise(resolve => setTimeout(resolve, bandwidthDelayMs));
        }
      }

      this.ws.send(queueItem.message);
    }

    this.isProcessingQueue = false;
  }

  private shouldApplyLatency(message: string): boolean {
    if (!PartyConnection.latencyEnabled || PartyConnection.latencyMs <= 0) {
      return false;
    }
    if (!PartyConnection.latencyFilter) {
      return true;
    }
    return message.includes(PartyConnection.latencyFilter);
  }

  private async waitUntil(targetTimestamp: number): Promise<void> {
    const delayMs = targetTimestamp - Date.now();
    if (delayMs <= 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
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
   * Buffers incoming messages to simulate TCP latency on reception.
   *
   * Messages are processed in strict order. Each message keeps its own fixed
   * latency delay relative to the moment it arrived.
   *
   * @param {string} message - Raw incoming message
   * @param {(messages: string[]) => Promise<void>} processor - Async batch processor
   * 
   * @example
   * await connection.bufferIncoming(raw, async (batch) => {
   *   for (const msg of batch) await handle(msg)
   * })
   */
  bufferIncoming(message: string, processor: (messages: string[]) => Promise<void>): void {
    this.incomingQueue.push({
      message,
      timestamp: Date.now(),
      processor,
    });
    if (!this.isProcessingIncomingQueue) {
      void this.processIncomingQueue();
    }
  }

  private async processIncomingQueue(): Promise<void> {
    if (this.isProcessingIncomingQueue) {
      return;
    }
    this.isProcessingIncomingQueue = true;
    while (this.incomingQueue.length > 0) {
      const item = this.incomingQueue.shift()!;
      if (this.shouldApplyLatency(item.message)) {
        await this.waitUntil(item.timestamp + PartyConnection.latencyMs);
      }
      try {
        await item.processor([item.message]);
      } catch (err) {
        console.error('Error processing incoming message:', err);
      }
    }
    this.isProcessingIncomingQueue = false;
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
   * Configures bandwidth simulation settings
   * 
   * @param {boolean} enabled - Whether to enable bandwidth simulation
   * @param {number} kbps - Bandwidth in kilobits per second (e.g., 100 = 100 kbps)
   * @param {string} filter - Optional filter string to only simulate bandwidth for messages containing this string
   * 
   * @example
   * ```typescript
   * PartyConnection.configureBandwidth(true, 50); // 50 kbps (very slow connection)
   * PartyConnection.configureBandwidth(true, 1000, 'sync'); // 1 Mbps only for sync messages
   * ```
   */
  static configureBandwidth(enabled: boolean, kbps: number, filter?: string): void {
    PartyConnection.bandwidthEnabled = enabled;
    PartyConnection.bandwidthKbps = Math.max(1, kbps); // Minimum 1 kbps
    PartyConnection.bandwidthFilter = filter || '';
    
    if (enabled && kbps > 0) {
      const filterInfo = filter ? ` (filtered: "${filter}")` : '';
      console.log(`\x1b[35m[BANDWIDTH SIMULATION]\x1b[0m Enabled with ${kbps} kbps bandwidth${filterInfo}`);
    } else if (enabled) {
      console.log(`\x1b[35m[BANDWIDTH SIMULATION]\x1b[0m Enabled but bandwidth is 0 kbps (no delay will be applied)`);
    } else {
      console.log(`\x1b[35m[BANDWIDTH SIMULATION]\x1b[0m Disabled`);
    }
  }

  /**
   * Gets current bandwidth simulation status
   * 
   * @returns {Object} Current configuration
   */
  static getBandwidthStatus(): { enabled: boolean; kbps: number; filter: string } {
    return {
      enabled: PartyConnection.bandwidthEnabled,
      kbps: PartyConnection.bandwidthKbps,
      filter: PartyConnection.bandwidthFilter
    };
  }

  /**
   * Configures latency simulation settings
   * 
   * Latency simulates the ping time to a distant server. Each message gets the same fixed delay,
   * regardless of when it was sent. This means if you send 3 messages rapidly, they will all
   * have the same latency delay applied to them.
   * 
   * @param {boolean} enabled - Whether to enable latency simulation
   * @param {number} ms - Fixed latency in milliseconds (simulates ping to distant server)
   * @param {string} filter - Optional filter string to only simulate latency for messages containing this string
   * 
   * @example
   * ```typescript
   * PartyConnection.configureLatency(true, 100); // 100ms latency (distant server)
   * PartyConnection.configureLatency(true, 200, 'sync'); // 200ms latency only for sync messages
   * ```
   */
  static configureLatency(enabled: boolean, ms: number, filter?: string): void {
    PartyConnection.latencyEnabled = enabled;
    PartyConnection.latencyMs = Math.max(0, ms);
    PartyConnection.latencyFilter = filter || '';
    
    if (enabled && ms > 0) {
      const filterInfo = filter ? ` (filtered: "${filter}")` : '';
      console.log(`\x1b[35m[LATENCY SIMULATION]\x1b[0m Enabled with ${ms}ms fixed latency${filterInfo}`);
    } else if (enabled) {
      console.log(`\x1b[35m[LATENCY SIMULATION]\x1b[0m Enabled but latency is 0ms (no delay will be applied)`);
    } else {
      console.log(`\x1b[35m[LATENCY SIMULATION]\x1b[0m Disabled`);
    }
  }

  /**
   * Gets current latency simulation status
   * 
   * @returns {Object} Current configuration
   */
  static getLatencyStatus(): { enabled: boolean; ms: number; filter: string } {
    return {
      enabled: PartyConnection.latencyEnabled,
      ms: PartyConnection.latencyMs,
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
   * Broadcasts a message to all connected clients with bandwidth simulation
   *
   * Messages are sent to each connection in parallel, but each connection maintains
   * its own ordered queue of messages with bandwidth limitations. This ensures that 
   * broadcast messages are queued in the correct order for each individual connection,
   * while being slowed down by simulated bandwidth constraints.
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
        // Each connection will handle its own queue ordering
        sendPromises.push(connection.send(data));
      }
    }
    
    // Wait for all messages to be queued (actual sending happens asynchronously in each connection's queue)
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

function normalizeRoomMapId(roomId: string): string {
  return roomId.startsWith("map-") ? roomId.slice(4) : roomId;
}

function toBasePathPrefix(basePath: string): string {
  const trimmed = basePath.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function extractFileLikeMapDefinition(maps: any[], mapId: string): any | null {
  for (const mapDef of maps) {
    if (typeof mapDef === "object" && mapDef) {
      const candidateId = typeof mapDef.id === "string" ? mapDef.id.replace(/^map-/, "") : "";
      if (candidateId === mapId) {
        return mapDef;
      }
      continue;
    }
    if (typeof mapDef === "string") {
      const fileName = mapDef.split("/").pop()?.replace(/\.tmx$/i, "");
      if (fileName === mapId) {
        return { id: mapId, file: mapDef };
      }
    }
  }
  return null;
}

async function fetchTextByUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  }
}

async function readTextByFilePath(pathLike: string): Promise<string | null> {
  let readFileFn: ((path: string, encoding: "utf8") => Promise<string>) | null = null;
  let isAbsoluteFn: ((path: string) => boolean) | null = null;
  let joinFn: ((...paths: string[]) => string) | null = null;

  try {
    const fsModule = await import("node:fs/promises");
    const pathModule = await import("node:path");
    readFileFn = fsModule.readFile as (path: string, encoding: "utf8") => Promise<string>;
    isAbsoluteFn = pathModule.isAbsolute as (path: string) => boolean;
    joinFn = pathModule.join as (...paths: string[]) => string;
  } catch {
    return null;
  }

  if (!readFileFn || !isAbsoluteFn || !joinFn) {
    return null;
  }

  const candidates = isAbsoluteFn(pathLike)
    ? [pathLike]
    : [pathLike, joinFn(process.cwd(), pathLike)];

  for (const candidate of candidates) {
    try {
      return await readFileFn(candidate, "utf8");
    } catch {
      // Try next candidate
    }
  }
  return null;
}

async function resolveMapDocument(
  mapId: string,
  mapDefinition: any,
  host?: string,
): Promise<{ xml: string; sourceUrl?: string }> {
  if (typeof mapDefinition?.data === "string" && mapDefinition.data.includes("<map")) {
    return { xml: mapDefinition.data };
  }

  if (typeof mapDefinition?.file === "string") {
    const file = mapDefinition.file.trim();
    if (file.includes("<map")) {
      return { xml: file };
    }
    if (/^https?:\/\//i.test(file)) {
      const xml = await fetchTextByUrl(file);
      if (xml) {
        return { xml, sourceUrl: file };
      }
    }
    if (file.startsWith("/") && host) {
      const sourceUrl = `http://${host}${file}`;
      const xml = await fetchTextByUrl(sourceUrl);
      if (xml) {
        return { xml, sourceUrl };
      }
    }
    const xmlFromFile = await readTextByFilePath(file);
    if (xmlFromFile) {
      return { xml: xmlFromFile };
    }
  }

  if (host) {
    const envBasePath = process.env.RPGJS_TILED_BASE_PATH;
    const basePathCandidates = [
      envBasePath,
      "map",
      "data",
      "assets/data",
      "assets/map",
    ].filter((value): value is string => !!value);

    for (const basePath of basePathCandidates) {
      const prefix = toBasePathPrefix(basePath);
      const sourceUrl = `http://${host}${prefix}/${mapId}.tmx`;
      const xml = await fetchTextByUrl(sourceUrl);
      if (xml) {
        return { xml, sourceUrl };
      }
    }
  }

  return { xml: "" };
}

async function enrichMapWithParsedTiledData(payload: any, host?: string): Promise<void> {
  if (payload?.parsedMap || typeof payload?.id !== "string") {
    return;
  }

  const maps = Array.isArray(payload.__maps) ? payload.__maps : [];
  const mapDefinition = extractFileLikeMapDefinition(maps, payload.id);
  const mapDoc = await resolveMapDocument(payload.id, mapDefinition, host);
  if (!mapDoc.xml) {
    return;
  }

  try {
    const tiledModuleName = "@canvasengine/tiled";
    const tiledModule = await import(/* @vite-ignore */ tiledModuleName);
    const TiledParser = tiledModule?.TiledParser;
    if (!TiledParser) {
      return;
    }

    const mapParser = new TiledParser(mapDoc.xml);
    const parsedMap = mapParser.parseMap();

    const tilesets = Array.isArray(parsedMap?.tilesets) ? parsedMap.tilesets : [];
    const mergedTilesets: any[] = [];

    for (const tileset of tilesets) {
      if (!tileset?.source) {
        mergedTilesets.push(tileset);
        continue;
      }

      let tilesetUrl: string | undefined;
      if (mapDoc.sourceUrl) {
        try {
          tilesetUrl = new URL(tileset.source, mapDoc.sourceUrl).toString();
        } catch {
          tilesetUrl = undefined;
        }
      } else if (host) {
        const prefix = toBasePathPrefix(process.env.RPGJS_TILED_BASE_PATH || "map");
        const candidatePath = tileset.source.startsWith("/")
          ? tileset.source
          : `${prefix}/${tileset.source}`.replace(/\/{2,}/g, "/");
        tilesetUrl = `http://${host}${candidatePath.startsWith("/") ? candidatePath : `/${candidatePath}`}`;
      }

      const tilesetRaw = tilesetUrl
        ? await fetchTextByUrl(tilesetUrl)
        : await readTextByFilePath(tileset.source);
      if (!tilesetRaw) {
        mergedTilesets.push(tileset);
        continue;
      }

      try {
        const tilesetParser = new TiledParser(tilesetRaw);
        const parsedTileset = tilesetParser.parseTileset();
        mergedTilesets.push({
          ...tileset,
          ...parsedTileset,
        });
      } catch {
        mergedTilesets.push(tileset);
      }
    }

    parsedMap.tilesets = mergedTilesets;

    payload.data = mapDoc.xml;
    payload.parsedMap = parsedMap;
    if (typeof parsedMap?.width === "number" && typeof parsedMap?.tilewidth === "number") {
      payload.width = parsedMap.width * parsedMap.tilewidth;
    }
    if (typeof parsedMap?.height === "number" && typeof parsedMap?.tileheight === "number") {
      payload.height = parsedMap.height * parsedMap.tileheight;
    }
  } catch {
    // Keep fallback payload when tiled parser is unavailable.
  }
}

async function updateMap(roomId: string, rpgServer: RpgServerEngine, host?: string) {
  if (!roomId.startsWith('map-')) {
    return;
  }

  try {
    const mapId = normalizeRoomMapId(roomId);
    const serverMaps = Array.isArray((rpgServer as any)?.maps) ? (rpgServer as any).maps : [];
    const defaultMapPayload: any = {
      id: mapId,
      width: 0,
      height: 0,
      events: [] as any[],
      __maps: serverMaps,
    };
    await enrichMapWithParsedTiledData(defaultMapPayload, host);
    delete defaultMapPayload.__maps;

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
  let lastKnownHost = "";

  // Ensure a room and its server instance exist for a given roomId
  async function ensureRoomAndServer(roomId: string, host?: string) {
    if (host) {
      lastKnownHost = host;
    }

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

      await updateMap(roomId, rpgServer, host || lastKnownHost);
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
          const { rpgServer } = await ensureRoomAndServer(targetRoomId, lastKnownHost);
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
      const bandwidthStatus = PartyConnection.getBandwidthStatus();
      const latencyStatus = PartyConnection.getLatencyStatus();
      
      if (packetLossStatus.enabled) {
        const filterInfo = packetLossStatus.filter ? ` (filter: "${packetLossStatus.filter}")` : '';
        console.log(`\x1b[36m[NETWORK SIMULATION]\x1b[0m Packet loss simulation: ${(packetLossStatus.rate * 100).toFixed(1)}% loss rate${filterInfo}`);
      } else {
        console.log(`\x1b[36m[NETWORK SIMULATION]\x1b[0m Packet loss simulation: disabled`);
      }
      
      if (bandwidthStatus.enabled) {
        const filterInfo = bandwidthStatus.filter ? ` (filter: "${bandwidthStatus.filter}")` : '';
        console.log(`\x1b[36m[NETWORK SIMULATION]\x1b[0m Bandwidth simulation: ${bandwidthStatus.kbps} kbps${filterInfo}`);
      } else {
        console.log(`\x1b[36m[NETWORK SIMULATION]\x1b[0m Bandwidth simulation: disabled`);
      }
      
      if (latencyStatus.enabled) {
        const filterInfo = latencyStatus.filter ? ` (filter: "${latencyStatus.filter}")` : '';
        console.log(`\x1b[36m[NETWORK SIMULATION]\x1b[0m Latency simulation: ${latencyStatus.ms}ms ping${filterInfo}`);
      } else {
        console.log(`\x1b[36m[NETWORK SIMULATION]\x1b[0m Latency simulation: disabled`);
      }

      // HTTP request interception for /parties/* routes
      server.middlewares.use("/parties", async (req, res, next) => {
        try {
          const host = req.headers.host || "localhost";
          const incomingUrl = req.url || "/";
          const parsedUrl = new URL(incomingUrl, `http://${host}`);
          const normalizedPath = parsedUrl.pathname.startsWith("/parties")
            ? parsedUrl.pathname
            : `/parties${parsedUrl.pathname.startsWith("/") ? parsedUrl.pathname : `/${parsedUrl.pathname}`}`;
          const pathParts = normalizedPath.split("/").filter(Boolean);

          if (pathParts[0] !== "parties" || pathParts[1] !== "main" || pathParts.length < 4) {
            next();
            return;
          }

          const roomId = pathParts[2];
          const requestPath = `/${pathParts.slice(3).join("/")}`;
          const { room, rpgServer } = await ensureRoomAndServer(roomId, host);
          room.context.parties = buildPartiesContext();

          const bodyText = await new Promise<string>((resolve, reject) => {
            const chunks: Buffer[] = [];
            req.on("data", (chunk: Buffer | string) => {
              chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
            });
            req.on("end", () => {
              resolve(Buffer.concat(chunks).toString("utf8"));
            });
            req.on("error", reject);
          });

          const requestHeaders = new Headers();
          Object.entries(req.headers).forEach(([key, value]) => {
            if (Array.isArray(value)) {
              if (value[0] !== undefined) requestHeaders.set(key, value[0]);
              return;
            }
            if (typeof value === "string") {
              requestHeaders.set(key, value);
            }
          });

          const requestLike = {
            url: `http://${host}/parties/main/${roomId}${requestPath}${parsedUrl.search}`,
            method: (req.method || "GET").toUpperCase(),
            headers: requestHeaders,
            json: async () => {
              if (!bodyText) return undefined as any;
              return JSON.parse(bodyText);
            },
            text: async () => bodyText,
          } as any;

          const result = await (rpgServer as any).onRequest(requestLike);

          if (result instanceof Response) {
            res.statusCode = result.status;
            result.headers.forEach((value, key) => {
              res.setHeader(key, value);
            });
            res.end(await result.text());
            return;
          }

          if (typeof result === "string") {
            res.statusCode = 200;
            res.setHeader("Content-Type", "text/plain");
            res.end(result);
            return;
          }

          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(result ?? {}));
        } catch (error) {
          console.error("Error handling RPG-JS request:", error);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
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
                    const ensured = await ensureRoomAndServer(roomName, request.headers.host || lastKnownHost);
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
                        const rawMessage = data.toString();

                        // Packet loss simulation (pre-buffer)
                        if (PartyConnection.packetLossEnabled && PartyConnection.packetLossRate > 0) {
                          if (!PartyConnection.packetLossFilter || rawMessage.includes(PartyConnection.packetLossFilter)) {
                            const random = Math.random();
                            if (random < PartyConnection.packetLossRate) {
                              console.log(`\x1b[31m[PACKET LOSS]\x1b[0m Connection ${connection.id}: Server dropped an incoming packet (${(PartyConnection.packetLossRate * 100).toFixed(1)}% loss rate)`);
                              console.log(`\x1b[33m[PACKET DATA]\x1b[0m ${rawMessage.substring(0, 100)}${rawMessage.length > 100 ? '...' : ''}`);
                              return;
                            }
                          }
                        }

                        // Buffer incoming messages to simulate TCP latency on reception
                        connection.bufferIncoming(rawMessage, async (batch: string[]) => {
                          // Process in order
                          for (const msg of batch) {
                            if (typeof rpgServer.onMessage === "function") {
                              await rpgServer.onMessage(msg, connection as any);
                            }
                          }
                        });
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
