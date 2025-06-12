import { Context } from "@signe/di";

export const WebSocketToken = "websocket";

export abstract class AbstractWebsocket {
  constructor(protected context: Context) {}

  abstract connection(listeners?: (data: any) => void): Promise<void>;
  abstract emit(event: string, data: any): void;
  abstract on(event: string, callback: (data: any) => void): void;
  abstract off(event: string, callback: (data: any) => void): void;
  abstract updateProperties(params: { room: string, host?: string }): void;
  abstract reconnect(listeners?: (data: any) => void): void;
}
