import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { RpgServerEngine } from "../RpgServerEngine";

export interface RpgWebSocketConnection {
  readyState: number;
  send(data: string): void;
  close(): void;
  on(event: string, callback: (...args: any[]) => void): void;
}

export interface RpgWebSocketServer {
  handleUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    callback: (ws: RpgWebSocketConnection) => void,
  ): void;
  close(): void;
}

export interface RpgTransportRequestLike {
  url: string;
  method?: string;
  headers?: Headers | HeadersInit | IncomingHttpHeaders | Map<string, string | undefined>;
  text(): Promise<string>;
  json(): Promise<any>;
}

export interface RpgWebSocketRequestLike {
  url?: string;
  method?: string;
  headers?: Headers | HeadersInit | IncomingHttpHeaders | Map<string, string | undefined>;
}

export type RpgTransportServer = RpgServerEngine & {
  onStart?(): void | Promise<void>;
  onRequest?(req: RpgTransportRequestLike): any | Promise<any>;
  onMessage?(message: string, connection: any): void | Promise<void>;
  onClose?(connection: any): void | Promise<void>;
  onConnect?(connection: any, context: any): void | Promise<void>;
  maps?: any[];
};

export type RpgTransportServerConstructor = new (room: any) => RpgTransportServer;

export interface CreateRpgServerTransportOptions {
  initializeMaps?: boolean;
  mapUpdateToken?: string;
  partiesPath?: string;
  tiledBasePaths?: string[];
}

export interface HandleNodeRequestOptions {
  mountedPath?: string;
}

export interface SendMapUpdateOptions {
  headers?: HeadersInit | IncomingHttpHeaders | Map<string, string | undefined>;
  host?: string;
}
