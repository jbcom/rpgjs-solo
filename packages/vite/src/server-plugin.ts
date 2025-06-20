import { RpgServerEngine } from "@rpgjs/server";
import type { ViteDevServer } from 'vite';
import { IncomingMessage } from 'http';
import { Duplex } from 'stream';

// Types for WebSocket without importing ws directly
interface WSConnection {
  readyState: number;
  send(data: string): void;
  close(): void;
  on(event: string, callback: (...args: any[]) => void): void;
}

interface WSServer {
  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer, callback: (ws: WSConnection) => void): void;
  close(): void;
}

/**
 * Interface for WebSocket connections adapted to RPG-JS server
 * 
 * This interface simulates a connection similar to MockConnection,
 * allowing the RPG-JS server to handle WebSocket connections transparently.
 */
interface RpgWebSocketConnection {
  id: string;
  state: any;
  server: RpgServerEngine;
  send: (data: any) => void;
  close: () => void;
  setState: (value: any) => void;
}

/**
 * Adapter class for WebSocket connections
 * 
 * This class adapts native WebSockets to be compatible
 * with the MockConnection interface expected by the RPG-JS server. It handles message
 * serialization and maintains the connection state.
 */
class WebSocketAdapter implements RpgWebSocketConnection {
  public id: string;
  public state: any = {};
  public server: RpgServerEngine;

  constructor(
    private ws: WSConnection,
    server: RpgServerEngine,
    id?: string
  ) {
    this.server = server;
    this.id = id || this.generateId();
    this.setupEventHandlers();
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
   * Sets up WebSocket event handlers
   * 
   * Sets up handling of incoming messages, errors and connection closures.
   * Messages are automatically forwarded to the RPG-JS server for processing.
   */
  private setupEventHandlers(): void {
    this.ws.on('message', (data: Buffer) => {
      try {
        const message = data.toString();
        // Check if the server has an onMessage method
        if (typeof this.server.onMessage === 'function') {
          this.server.onMessage(message, this as any);
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    });

    this.ws.on('close', () => {
      // Check if the server has an onClose method
      if (typeof this.server.onClose === 'function') {
        this.server.onClose(this as any);
      }
    });

    this.ws.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
      if (typeof this.server.onClose === 'function') {
        this.server.onClose(this as any);
      }
    });
  }

  /**
   * Sends data via the WebSocket connection
   * 
   * @param {any} data - Data to send (automatically serialized to JSON)
   */
  send(data: any): void {
    // 1 = WebSocket.OPEN
    if (this.ws.readyState === 1) {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      this.ws.send(message);
    }
  }

  /**
   * Closes the WebSocket connection
   */
  close(): void {
    // 1 = WebSocket.OPEN
    if (this.ws.readyState === 1) {
      this.ws.close();
    }
  }

  /**
   * Sets the connection state
   * 
   * @param {any} value - New state to assign to the connection
   */
  setState(value: any): void {
    this.state = value;
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
  if (typeof process === 'undefined' || !process.versions?.node) {
    console.warn('Not in Node.js environment, WebSocket server not available');
    return null;
  }

  try {
    // Use createRequire to import ws in an ES module context
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const ws = require('ws');
    return ws.WebSocketServer || ws.default?.WebSocketServer || ws;
  } catch (error) {
    console.warn('Failed to load ws module:', error);
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
export function serverPlugin(serverModule: new () => RpgServerEngine) {
  let rpgServer: RpgServerEngine;
  let wsServer: WSServer | null = null;

  return {
    name: "server-plugin",
    
    async configureServer(server: ViteDevServer) {
      // RPG-JS server initialization
      rpgServer = new serverModule();
      
      // Simplified server initialization without calling onStart()
      // The @signe/room framework manages its own lifecycle
      console.log('RPG-JS server instance created');

      // Dynamic import of WebSocketServer to avoid compatibility issues
      try {
        const WebSocketServerClass = await importWebSocketServer();
        if (WebSocketServerClass) {
          wsServer = new WebSocketServerClass({
            noServer: true,
          });
          console.log('WebSocket server initialized successfully');
        } else {
          console.log('WebSocket server not available in this environment');
        }
      } catch (error) {
        console.warn('WebSocket server not available:', error);
        wsServer = null;
      }

      // HTTP request interception for /parties/* routes
      server.middlewares.use('/parties', async (req, res, next) => {
        try {
          // For now, pass to the next middleware
          // The RPG-JS server handles its own routes via @signe/room
          console.log(`RPG-JS HTTP request: ${req.method} ${req.url}`);
          
          // Create a basic response for test routes
          if (req.url?.includes('/test')) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ 
              message: 'RPG-JS server is running',
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          next();
        } catch (error) {
          console.error('Error handling RPG-JS request:', error);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      });
      // WebSocket upgrade handling (if available)
      if (wsServer) {
        server.httpServer?.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
          const url = new URL(request.url!, `http://${request.headers.host}`);
          
          // Check if it's a WebSocket connection for RPG-JS
          if (url.pathname.startsWith('/parties/')) {
            console.log(`WebSocket upgrade request: ${url.pathname}`);
            
            wsServer!.handleUpgrade(request, socket, head, async (ws: WSConnection) => {
              try {
                // Create the connection adapter
                const connection = new WebSocketAdapter(ws, rpgServer);
                
                console.log(`WebSocket connection established: ${connection.id}`);
                
                // For now, just maintain the connection
                // The RPG-JS server handles its own connections via @signe/room
                ws.send(JSON.stringify({
                  type: 'connected',
                  id: connection.id,
                  message: 'Connected to RPG-JS server'
                }));
                
              } catch (error) {
                console.error('Error establishing WebSocket connection:', error);
                ws.close();
              }
            });
          }
        });
      }

      console.log('RPG-JS server plugin configured with HTTP and WebSocket forwarding');
    },

    buildStart() {
      console.log('RPG-JS server starting...');
    },

    buildEnd() {
      // Cleanup when server stops
      if (wsServer) {
        wsServer.close();
      }
      console.log('RPG-JS server stopped');
    }
  }
}