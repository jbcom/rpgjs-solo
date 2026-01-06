import type { SaveSlotList, SaveSlotMeta } from "@rpgjs/common";
import { inject } from "../core/inject";
import { AbstractWebsocket, WebSocketToken } from "./AbstractSocket";

export const SaveClientToken = "SaveClientToken";

type SaveListResult = {
  requestId: string;
  slots: SaveSlotList;
};

type SaveSaveResult = {
  requestId: string;
  index: number;
  slots: SaveSlotList;
};

type SaveLoadResult = {
  requestId: string;
  index: number;
  ok: boolean;
  slot?: SaveSlotMeta;
};

type SaveErrorResult = {
  requestId: string;
  message: string;
};

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
};

export class SaveClientService {
  private webSocket: AbstractWebsocket;
  private pending: Map<string, PendingRequest> = new Map();
  private requestCounter = 0;

  constructor() {
    this.webSocket = inject(WebSocketToken);
    this.webSocket.on("save.list.result", (data: SaveListResult) => this.resolveRequest(data.requestId, data));
    this.webSocket.on("save.save.result", (data: SaveSaveResult) => this.resolveRequest(data.requestId, data));
    this.webSocket.on("save.load.result", (data: SaveLoadResult) => this.resolveRequest(data.requestId, data));
    this.webSocket.on("save.error", (data: SaveErrorResult) => this.rejectRequest(data.requestId, data.message));
  }

  listSlots(): Promise<SaveSlotList> {
    return this.request<SaveListResult>("save.list", {}).then((result) => result.slots);
  }

  saveSlot(index: number, meta: SaveSlotMeta = {}): Promise<SaveSlotList> {
    return this.request<SaveSaveResult>("save.save", { index, meta }).then((result) => result.slots);
  }

  loadSlot(index: number): Promise<boolean> {
    return this.request<SaveLoadResult>("save.load", { index }).then((result) => result.ok);
  }

  private request<T>(event: string, payload: Record<string, any>): Promise<T> {
    return new Promise((resolve, reject) => {
      const requestId = this.nextRequestId();
      this.pending.set(requestId, { resolve, reject });
      this.webSocket.emit(event, { requestId, ...payload });
    });
  }

  private resolveRequest(requestId: string, result: any) {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    pending.resolve(result);
  }

  private rejectRequest(requestId: string, message: string) {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    pending.reject(new Error(message));
  }

  private nextRequestId(): string {
    this.requestCounter += 1;
    return `${Date.now()}-${this.requestCounter}`;
  }
}

export function provideSaveClient() {
  return {
    provide: SaveClientService,
    useClass: SaveClientService,
  };
}
