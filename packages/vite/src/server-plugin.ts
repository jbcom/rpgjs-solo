import { createRpgServerTransport, logNetworkSimulationStatus } from "@rpgjs/server/node";
import type { RpgTransportServerConstructor, RpgWebSocketServer } from "@rpgjs/server/node";
import type { ViteDevServer } from "vite";

export interface RpgjsDevServerOptions {
  /** Remote Node or Wrangler origin. When omitted, Vite hosts the Node transport. */
  target?: string;
  /** Map ids published to the remote administration endpoint. */
  mapIds?: string[];
  mapUpdateToken?: string;
  tiledBasePaths?: string[];
  /** Build a provider-specific authoritative payload before remote publication. */
  resolveMapPayload?: (context: { mapId: string; defaultPayload: unknown }) => unknown | Promise<unknown>;
}

class MapPublicationError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

async function importWebSocketServer(): Promise<any> {
  if (typeof process === "undefined" || !process.versions?.node) {
    console.warn("Not in Node.js environment, WebSocket server not available");
    return null;
  }

  try {
    const { createRequire } = await import("module");
    const require = createRequire(import.meta.url);
    const ws = require("ws");
    return ws.WebSocketServer || ws.default?.WebSocketServer || ws;
  } catch (error) {
    console.warn("Failed to load ws module:", error);
    return null;
  }
}

export function serverPlugin(serverModule: RpgTransportServerConstructor, options: RpgjsDevServerOptions = {}) {
  let wsServer: RpgWebSocketServer | null = null;
  const isRemote = Boolean(options.target);
  const transport = createRpgServerTransport(serverModule, {
    initializeMaps: !isRemote,
    mapUpdateToken: options.mapUpdateToken,
    tiledBasePaths: options.tiledBasePaths,
  });
  let publishTimer: ReturnType<typeof setTimeout> | undefined;

  const publishMaps = async () => {
    if (!options.target) return;
    await Promise.all(
      (options.mapIds ?? []).map(async (mapId) => {
        const response = await transport.publishMap(mapId, {
          target: options.target!,
          transformPayload: options.resolveMapPayload
            ? (defaultPayload, normalizedMapId) =>
                options.resolveMapPayload!({
                  mapId: normalizedMapId,
                  defaultPayload,
                })
            : undefined,
        });
        if (!response.ok) {
          const retryable = response.status === 408 || response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504;
          throw new MapPublicationError(`Unable to publish map ${mapId}: ${response.status} ${await response.text()}`, retryable);
        }
      }),
    );
  };

  const publishMapsWithRetry = async (attempts = 20, delayMs = 250): Promise<void> => {
    try {
      await publishMaps();
    } catch (error) {
      if (attempts <= 1 || (error instanceof MapPublicationError && !error.retryable)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      await publishMapsWithRetry(attempts - 1, delayMs);
    }
  };

  return {
    name: "server-plugin",

    config() {
      if (!options.target) return;
      return {
        server: {
          proxy: {
            "/parties": {
              target: options.target,
              ws: true,
              changeOrigin: true,
            },
          },
        },
      };
    },

    async configureServer(server: ViteDevServer) {
      if (isRemote) {
        server.httpServer?.once("listening", () => {
          void publishMapsWithRetry().catch((error) => console.error("[RPGJS] Map publication failed:", error));
        });
        server.watcher.on("change", (file) => {
          const normalizedFile = file.replaceAll("\\", "/");
          if (/(?:^|\/)(?:\.git|\.wrangler|dist|node_modules)(?:\/|$)/.test(normalizedFile)) {
            return;
          }
          if (publishTimer) clearTimeout(publishTimer);
          publishTimer = setTimeout(() => {
            void publishMapsWithRetry(5).catch((error) => console.error("[RPGJS] Map republication failed:", error));
          }, 100);
        });
        return;
      }

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

      console.log("RPG-JS server plugin initialized");
      logNetworkSimulationStatus();

      server.middlewares.use("/parties", async (req, res, next) => {
        await transport.handleNodeRequest(req, res, next, {
          mountedPath: "/parties",
        });
      });

      if (wsServer) {
        server.httpServer?.on("upgrade", (request, socket, head) => {
          void transport.handleUpgrade(wsServer!, request, socket, head);
        });
      }

      console.log("RPG-JS server plugin configured with HTTP and WebSocket forwarding !");
    },

    buildStart() {
      console.log("RPG-JS server starting...");
    },

    buildEnd() {
      if (publishTimer) clearTimeout(publishTimer);
      if (wsServer) {
        wsServer.close();
      }
      console.log("RPG-JS server stopped");
    },
  };
}
