import { PartyConnection } from "./connection";

export class PartyRoom {
  public id: string;
  public internalID: string;
  public env: Record<string, any> = {};
  public context: any = {};

  private connections = new Map<string, PartyConnection>();
  private storageData = new Map<string, any>();

  constructor(id: string) {
    this.id = id;
    this.internalID = `internal_${id}_${Date.now()}`;
  }

  async broadcast(message: any, except: string[] = []): Promise<void> {
    const data = typeof message === "string" ? message : JSON.stringify(message);
    const sendPromises: Promise<void>[] = [];

    for (const [connectionId, connection] of this.connections) {
      if (!except.includes(connectionId)) {
        sendPromises.push(connection.send(data));
      }
    }

    await Promise.all(sendPromises);
  }

  getConnection(id: string): PartyConnection | undefined {
    return this.connections.get(id);
  }

  getConnections(tag?: string): IterableIterator<PartyConnection> {
    void tag;
    return this.connections.values();
  }

  addConnection(connection: PartyConnection): void {
    this.connections.set(connection.id, connection);
  }

  removeConnection(connectionId: string): void {
    this.connections.delete(connectionId);
  }

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
        return Array.from(this.storageData.entries());
      },
    };
  }
}
