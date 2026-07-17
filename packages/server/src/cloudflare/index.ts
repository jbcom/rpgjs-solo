import {
  SigneRoomDurableObject,
  createCloudflareRoomWorker,
  type CloudflareRoomEnv,
  type CloudflareRoomWorkerOptions,
} from "@signe/room/cloudflare";
import type { RpgServerEngine } from "../RpgServerEngine";
import { MAP_UPDATE_TOKEN_ENV } from "../map-update";

export { SigneRoomDurableObject as RpgServerDurableObject };

export interface CreateRpgServerWorkerOptions
  extends Omit<CloudflareRoomWorkerOptions, "env"> {
  /** Static values merged into each Signe room environment. */
  env?: Record<string, unknown>;
  /** Reject map administration requests when the secret is absent. @default true */
  requireMapUpdateToken?: boolean;
}

export type RpgServerWorkerConstructor = new (room: unknown) => RpgServerEngine;

/**
 * Create a Cloudflare Worker that routes RPGJS rooms through `@signe/room`.
 * Gameplay maps are initialized exclusively through the authenticated
 * `POST /parties/main/map-<id>/map/update` administration endpoint.
 */
export function createRpgServerWorker(
  serverModule: RpgServerWorkerConstructor,
  options: CreateRpgServerWorkerOptions,
) {
  const requireMapUpdateToken = options.requireMapUpdateToken ?? true;
  class RpgCloudflareServer extends serverModule {
    async onConnect(connection: any, context: any) {
      // Older Workerd versions can report CONNECTING immediately after
      // acceptWebSocket(), even though Durable Objects already permit sends.
      // @signe/room 3.1.0 guards on readyState and would otherwise discard the
      // initial sync, map stream, and connection acceptance packets.
      const acceptedSocket = connection?.rawWebSocket;
      if (acceptedSocket?.readyState === 0 && typeof acceptedSocket.send === "function") {
        connection.send = acceptedSocket.send.bind(acceptedSocket);
      }
      await super.onConnect?.(connection, context);
      await connection.send(JSON.stringify({
        type: "connected",
        id: connection.id,
        message: "Connected to RPG-JS server",
      }));
    }
  }
  const worker = createCloudflareRoomWorker(RpgCloudflareServer as any, options);

  return {
    async fetch(request: Request, env: CloudflareRoomEnv, ctx: unknown): Promise<Response> {
      if (requireMapUpdateToken && isMapUpdateRequest(request)) {
        const token = env[MAP_UPDATE_TOKEN_ENV];
        if (typeof token !== "string" || token.length === 0) {
          return Response.json(
            { error: `Missing required Worker secret: ${MAP_UPDATE_TOKEN_ENV}` },
            { status: 503 },
          );
        }
      }

      return worker.fetch(request, env, ctx);
    },
  };
}

function isMapUpdateRequest(request: Request): boolean {
  const url = new URL(request.url);
  return request.method.toUpperCase() === "POST"
    && /(?:^|\/)map-[^/]+\/map\/update\/?$/.test(url.pathname);
}
