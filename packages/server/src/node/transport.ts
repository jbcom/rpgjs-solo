import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { injector } from "@signe/di";
import { context as serverContext } from "../core/context";
import { setInject } from "../core/inject";
import { provideServerModules } from "../module";
import { PartyConnection } from "./connection";
import { createMapUpdateHeaders, resolveMapUpdateToken, updateMap } from "./map";
import { PartyRoom } from "./room";
import type {
  CreateRpgServerTransportOptions,
  HandleNodeRequestOptions,
  RpgTransportRequestLike,
  RpgTransportServer,
  RpgTransportServerConstructor,
  RpgWebSocketConnection,
  RpgWebSocketRequestLike,
  RpgWebSocketServer,
  SendMapUpdateOptions,
} from "./types";

type PartiesFetchInit = {
  body?: any;
  headers?: HeadersInit | IncomingHttpHeaders | Map<string, string | undefined>;
  method?: string;
};

function normalizePathPrefix(path: string, fallback: string): string {
  const trimmed = (path || fallback).trim();
  if (!trimmed) {
    return fallback;
  }
  const prefixed = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return prefixed !== "/" ? prefixed.replace(/\/+$/, "") : prefixed;
}

function hasPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function prependMountedPath(pathname: string, mountedPath?: string): string {
  if (!mountedPath) {
    return pathname;
  }
  const normalizedMountedPath = normalizePathPrefix(mountedPath, "/");
  if (hasPathPrefix(pathname, normalizedMountedPath)) {
    return pathname;
  }
  if (pathname === "/") {
    return normalizedMountedPath;
  }
  return `${normalizedMountedPath}${pathname.startsWith("/") ? pathname : `/${pathname}`}`.replace(/\/{2,}/g, "/");
}

function parseHttpRoute(pathname: string, partiesPath: string): { roomId: string; requestPath: string } | null {
  if (!hasPathPrefix(pathname, partiesPath)) {
    return null;
  }

  const remainder = pathname.slice(partiesPath.length);
  const segments = remainder.split("/").filter(Boolean);
  if (segments.length < 2) {
    return null;
  }

  return {
    roomId: segments[0],
    requestPath: `/${segments.slice(1).join("/")}`,
  };
}

function parseSocketRoute(pathname: string, partiesPath: string): { roomId: string } | null {
  if (!hasPathPrefix(pathname, partiesPath)) {
    return null;
  }

  const remainder = pathname.slice(partiesPath.length);
  const segments = remainder.split("/").filter(Boolean);
  if (segments.length < 1) {
    return null;
  }

  return { roomId: segments[0] };
}

function toHeaders(
  input?: Headers | HeadersInit | IncomingHttpHeaders | Map<string, string | undefined>,
): Headers {
  if (!input) {
    return new Headers();
  }
  if (input instanceof Headers) {
    return new Headers(input);
  }
  if (Array.isArray(input)) {
    return new Headers(input);
  }
  if (input instanceof Map) {
    const headers = new Headers();
    for (const [key, value] of input) {
      if (typeof value !== "undefined") {
        headers.set(key, value);
      }
    }
    return headers;
  }

  const headers = new Headers();
  Object.entries(input).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      if (typeof value[0] !== "undefined") {
        headers.set(key, value[0]);
      }
      return;
    }
    if (typeof value !== "undefined") {
      headers.set(key, String(value));
    }
  });
  return headers;
}

function createRequestLike(url: string, method: string, headers: Headers, bodyText: string): RpgTransportRequestLike {
  return {
    url,
    method,
    headers,
    json: async () => {
      if (!bodyText) {
        return undefined;
      }
      return JSON.parse(bodyText);
    },
    text: async () => bodyText,
  };
}

async function normalizeEngineResponse(result: any): Promise<Response> {
  if (result instanceof Response) {
    return result;
  }
  if (typeof result === "string") {
    return new Response(result, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }

  return new Response(JSON.stringify(result ?? {}), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

async function sendNodeResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  res.end(await response.text());
}

async function readNodeBody(req: IncomingMessage): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

function resolveUrlFromSocketRequest(request: RpgWebSocketRequestLike): { headers: Headers; method?: string; rawUrl: string; url: URL } {
  const headers = toHeaders(request.headers);
  const host = headers.get("host") || "localhost";
  const rawUrl = request.url || "/";
  const url = new URL(rawUrl, `http://${host}`);
  return {
    headers,
    method: request.method,
    rawUrl,
    url,
  };
}

function createConnectionContext(url: URL, headers: Headers, method?: string): any {
  const normalizedHeaders = new Map<string, string>();
  headers.forEach((value, key) => {
    normalizedHeaders.set(key.toLowerCase(), value);
  });

  return {
    request: {
      headers: {
        has: (name: string) => normalizedHeaders.has(name.toLowerCase()),
        get: (name: string) => normalizedHeaders.get(name.toLowerCase()),
        entries: () => normalizedHeaders.entries(),
        keys: () => normalizedHeaders.keys(),
        values: () => normalizedHeaders.values(),
      },
      method,
      url: url.toString(),
    },
    url,
  };
}

export class RpgServerTransport {
  private serverContextInitialized = false;
  private partiesPath: string;
  private readonly initializeMaps: boolean;
  private readonly mapUpdateToken: string;
  private readonly tiledBasePaths?: string[];
  private readonly rooms = new Map<string, PartyRoom>();
  private readonly servers = new Map<string, RpgTransportServer>();
  private lastKnownHost = "";

  constructor(
    private readonly serverModule: RpgTransportServerConstructor,
    options: CreateRpgServerTransportOptions = {},
  ) {
    this.initializeMaps = options.initializeMaps ?? true;
    this.mapUpdateToken = resolveMapUpdateToken(options.mapUpdateToken);
    this.partiesPath = normalizePathPrefix(options.partiesPath || "/parties/main", "/parties/main");
    this.tiledBasePaths = options.tiledBasePaths;
  }

  private async ensureServerContext(): Promise<void> {
    if (this.serverContextInitialized) {
      return;
    }

    setInject(serverContext);
    await injector(serverContext, [provideServerModules([])]);
    this.serverContextInitialized = true;
  }

  getRoom(roomId: string): PartyRoom | undefined {
    return this.rooms.get(roomId);
  }

  getServer(roomId: string): RpgTransportServer | undefined {
    return this.servers.get(roomId);
  }

  private async ensureRoomAndServer(roomId: string, host?: string): Promise<{ room: PartyRoom; rpgServer: RpgTransportServer }> {
    if (host) {
      this.lastKnownHost = host;
    }

    let room = this.rooms.get(roomId);
    if (!room) {
      room = new PartyRoom(roomId);
      this.rooms.set(roomId, room);
      console.log(`Created new room: ${roomId}`);
    }

    let rpgServer = this.servers.get(roomId);
    if (!rpgServer) {
      await this.ensureServerContext();
      rpgServer = new this.serverModule(room);
      this.servers.set(roomId, rpgServer);
      console.log(`Created new server instance for room: ${roomId}`);

      if (typeof rpgServer.onStart === "function") {
        try {
          await rpgServer.onStart();
          console.log(`Server started for room: ${roomId}`);
        } catch (error) {
          console.error(`Error starting server for room ${roomId}:`, error);
        }
      }

      if (this.initializeMaps) {
        await updateMap(roomId, rpgServer, {
          host: host || this.lastKnownHost,
          mapUpdateToken: this.mapUpdateToken,
          tiledBasePaths: this.tiledBasePaths,
        });
      }
    }

    room.context.parties = this.buildPartiesContext();
    return { room, rpgServer };
  }

  private buildPartiesContext() {
    return {
      main: {
        get: async (targetRoomId: string) => {
          return {
            fetch: async (path: string, init?: PartiesFetchInit) => {
              const method = (init?.method || "GET").toUpperCase();
              const headers = toHeaders(init?.headers);
              const requestPath = path.startsWith("/") ? path : `/${path}`;
              let bodyText = "";

              if (typeof init?.body === "string") {
                bodyText = init.body;
              } else if (typeof init?.body !== "undefined") {
                bodyText = JSON.stringify(init.body);
              }

              return this.dispatchRoomRequest(
                targetRoomId,
                createRequestLike(
                  `http://localhost${this.partiesPath}/${targetRoomId}${requestPath}`,
                  method,
                  headers,
                  bodyText,
                ),
                this.lastKnownHost,
              );
            },
          };
        },
      },
    } as any;
  }

  private async dispatchRoomRequest(roomId: string, requestLike: RpgTransportRequestLike, host?: string): Promise<Response> {
    const { room, rpgServer } = await this.ensureRoomAndServer(roomId, host);
    room.context.parties = this.buildPartiesContext();
    const result = await rpgServer.onRequest?.(requestLike);
    return normalizeEngineResponse(result);
  }

  async fetch(request: Request | string | URL, init?: RequestInit): Promise<Response> {
    const webRequest = request instanceof Request ? request : new Request(String(request), init);
    const url = new URL(webRequest.url);
    const route = parseHttpRoute(url.pathname, this.partiesPath);
    if (!route) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    const bodyText = await webRequest.text();
    return this.dispatchRoomRequest(
      route.roomId,
      createRequestLike(webRequest.url, webRequest.method.toUpperCase(), toHeaders(webRequest.headers), bodyText),
      url.host,
    );
  }

  async updateMap(mapId: string, payload: any, options: SendMapUpdateOptions = {}): Promise<Response> {
    const roomId = mapId.startsWith("map-") ? mapId : `map-${mapId}`;
    const headers = createMapUpdateHeaders(this.mapUpdateToken, options.headers);
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    return this.dispatchRoomRequest(
      roomId,
      createRequestLike(
        `http://localhost${this.partiesPath}/${roomId}/map/update`,
        "POST",
        headers,
        JSON.stringify(payload),
      ),
      options.host ?? this.lastKnownHost,
    );
  }

  async handleNodeRequest(
    req: IncomingMessage,
    res: ServerResponse,
    next?: () => void,
    options: HandleNodeRequestOptions = {},
  ): Promise<boolean> {
    try {
      const headers = toHeaders(req.headers);
      const host = headers.get("host") || "localhost";
      const url = new URL(req.url || "/", `http://${host}`);
      const normalizedPathname = prependMountedPath(url.pathname, options.mountedPath);
      const normalizedUrl = new URL(url.toString());
      normalizedUrl.pathname = normalizedPathname;

      const route = parseHttpRoute(normalizedUrl.pathname, this.partiesPath);
      if (!route) {
        next?.();
        return false;
      }

      const bodyText = await readNodeBody(req);
      const response = await this.dispatchRoomRequest(
        route.roomId,
        createRequestLike(normalizedUrl.toString(), (req.method || "GET").toUpperCase(), headers, bodyText),
        host,
      );

      await sendNodeResponse(res, response);
      return true;
    } catch (error) {
      console.error("Error handling RPG-JS request:", error);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Internal server error" }));
      return true;
    }
  }

  async acceptWebSocket(ws: RpgWebSocketConnection, request: RpgWebSocketRequestLike): Promise<boolean> {
    const normalizedRequest = resolveUrlFromSocketRequest(request);
    const route = parseSocketRoute(normalizedRequest.url.pathname, this.partiesPath);
    if (!route) {
      return false;
    }

    try {
      console.log(`WebSocket upgrade request: ${normalizedRequest.url.pathname}`);

      const queryParams = Object.fromEntries(normalizedRequest.url.searchParams.entries());
      console.log(`Room: ${route.roomId}, Query params:`, queryParams);

      const { room, rpgServer } = await this.ensureRoomAndServer(route.roomId, normalizedRequest.url.host);
      room.context.parties = this.buildPartiesContext();

      const connection = new PartyConnection(ws, queryParams._pk, normalizedRequest.rawUrl);
      room.addConnection(connection);

      console.log(`WebSocket connection established: ${connection.id} in room: ${route.roomId}`);

      let isClosed = false;
      const cleanup = async (logMessage?: string, error?: Error) => {
        if (isClosed) {
          return;
        }
        isClosed = true;
        if (logMessage) {
          console.log(logMessage);
        }
        if (error) {
          console.error("WebSocket error:", error);
        }
        room.removeConnection(connection.id);
        await rpgServer.onClose?.(connection as any);
      };

      ws.on("message", async (data: Buffer | string) => {
        try {
          const rawMessage = typeof data === "string" ? data : data.toString();

          if (PartyConnection.packetLossEnabled && PartyConnection.packetLossRate > 0) {
            if (!PartyConnection.packetLossFilter || rawMessage.includes(PartyConnection.packetLossFilter)) {
              const random = Math.random();
              if (random < PartyConnection.packetLossRate) {
                console.log(
                  `\x1b[31m[PACKET LOSS]\x1b[0m Connection ${connection.id}: Server dropped an incoming packet (${(PartyConnection.packetLossRate * 100).toFixed(1)}% loss rate)`,
                );
                console.log(`\x1b[33m[PACKET DATA]\x1b[0m ${rawMessage.slice(0, 100)}${rawMessage.length > 100 ? "..." : ""}`);
                return;
              }
            }
          }

          connection.bufferIncoming(rawMessage, async (batch: string[]) => {
            for (const message of batch) {
              await rpgServer.onMessage?.(message, connection as any);
            }
          });
        } catch (error) {
          console.error("Error processing WebSocket message:", error);
        }
      });

      ws.on("close", () => {
        void cleanup(`WebSocket connection closed: ${connection.id} from room: ${route.roomId}`);
      });

      ws.on("error", (error: Error) => {
        void cleanup(undefined, error);
      });

      if (typeof rpgServer.onConnect === "function") {
        await rpgServer.onConnect(
          connection as any,
          createConnectionContext(normalizedRequest.url, normalizedRequest.headers, normalizedRequest.method) as any,
        );
      }

      await connection.send({
        type: "connected",
        id: connection.id,
        message: "Connected to RPG-JS server",
      });

      return true;
    } catch (error) {
      console.error("Error establishing WebSocket connection:", error);
      ws.close();
      return true;
    }
  }

  async handleUpgrade(
    wsServer: RpgWebSocketServer,
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): Promise<boolean> {
    const headers = toHeaders(request.headers);
    const host = headers.get("host") || "localhost";
    const url = new URL(request.url || "/", `http://${host}`);
    if (!parseSocketRoute(url.pathname, this.partiesPath)) {
      return false;
    }

    wsServer.handleUpgrade(request, socket, head, (ws) => {
      void this.acceptWebSocket(ws, request);
    });

    return true;
  }
}

export function createRpgServerTransport(
  serverModule: RpgTransportServerConstructor,
  options?: CreateRpgServerTransportOptions,
): RpgServerTransport {
  return new RpgServerTransport(serverModule, options);
}
