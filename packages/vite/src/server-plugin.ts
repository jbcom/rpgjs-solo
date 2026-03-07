import { createRpgServerTransport, logNetworkSimulationStatus } from "@rpgjs/server/node";
import type { RpgTransportServerConstructor, RpgWebSocketServer } from "@rpgjs/server/node";
import type { ViteDevServer } from "vite";

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

export function serverPlugin(serverModule: RpgTransportServerConstructor) {
  let wsServer: RpgWebSocketServer | null = null;
  const transport = createRpgServerTransport(serverModule);

  return {
    name: "server-plugin",

    async configureServer(server: ViteDevServer) {
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
      if (wsServer) {
        wsServer.close();
      }
      console.log("RPG-JS server stopped");
    },
  };
}
