import type { RpgWebSocketConnection } from "./types";

type RuntimeProcess = {
  env?: Record<string, string | undefined>;
};

function readEnvVariable(name: string): string | undefined {
  const value = (globalThis as { process?: RuntimeProcess }).process?.env?.[name];
  return typeof value === "string" ? value : undefined;
}

export class PartyConnection {
  public id: string;
  public uri: string;
  private _state: any = {};
  private messageQueue: Array<{ message: string; timestamp: number; sequence: number }> = [];
  private isProcessingQueue = false;
  private sequenceCounter = 0;
  private incomingQueue: Array<{
    message: string;
    timestamp: number;
    processor: (messages: string[]) => Promise<void>;
  }> = [];
  private isProcessingIncomingQueue = false;

  public static packetLossRate = parseFloat(readEnvVariable("RPGJS_PACKET_LOSS_RATE") || "0.1");
  public static packetLossEnabled = readEnvVariable("RPGJS_ENABLE_PACKET_LOSS") === "true";
  public static packetLossFilter = readEnvVariable("RPGJS_PACKET_LOSS_FILTER") || "";
  public static bandwidthEnabled = readEnvVariable("RPGJS_ENABLE_BANDWIDTH") === "true";
  public static bandwidthKbps = parseInt(readEnvVariable("RPGJS_BANDWIDTH_KBPS") || "100");
  public static bandwidthFilter = readEnvVariable("RPGJS_BANDWIDTH_FILTER") || "";
  public static latencyEnabled = readEnvVariable("RPGJS_ENABLE_LATENCY") === "true";
  public static latencyMs = parseInt(readEnvVariable("RPGJS_LATENCY_MS") || "50");
  public static latencyFilter = readEnvVariable("RPGJS_LATENCY_FILTER") || "";

  constructor(private ws: RpgWebSocketConnection, id?: string, uri?: string) {
    this.id = id || this.generateId();
    this.uri = uri || "";
  }

  private generateId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  async send(data: any): Promise<void> {
    if (this.ws.readyState !== 1) {
      return;
    }

    const message = typeof data === "string" ? data : JSON.stringify(data);
    const timestamp = Date.now();
    const sequence = ++this.sequenceCounter;

    this.messageQueue.push({ message, timestamp, sequence });

    if (!this.isProcessingQueue) {
      void this.processMessageQueue();
    }
  }

  private async processMessageQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      return;
    }
    this.isProcessingQueue = true;

    while (this.messageQueue.length > 0) {
      const queueItem = this.messageQueue.shift()!;

      if (this.shouldApplyLatency(queueItem.message)) {
        await this.waitUntil(queueItem.timestamp + PartyConnection.latencyMs);
      }

      if (PartyConnection.bandwidthEnabled && PartyConnection.bandwidthKbps > 0) {
        if (!PartyConnection.bandwidthFilter || queueItem.message.includes(PartyConnection.bandwidthFilter)) {
          const messageSizeBits = queueItem.message.length * 8;
          const transmissionTimeMs = (messageSizeBits / (PartyConnection.bandwidthKbps * 1000)) * 1000;
          const bandwidthDelayMs = Math.max(transmissionTimeMs, 10);
          console.log(
            `\x1b[34m[BANDWIDTH SIMULATION]\x1b[0m Connection ${this.id}: Message #${queueItem.sequence} transmission time: ${bandwidthDelayMs.toFixed(1)}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, bandwidthDelayMs));
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

  close(): void {
    if (this.ws.readyState === 1) {
      this.ws.close();
    }
  }

  setState(value: any): void {
    this._state = value;
  }

  get state(): any {
    return this._state;
  }

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
        console.error("Error processing incoming message:", err);
      }
    }

    this.isProcessingIncomingQueue = false;
  }

  static configurePacketLoss(enabled: boolean, rate: number, filter?: string): void {
    PartyConnection.packetLossEnabled = enabled;
    PartyConnection.packetLossRate = Math.max(0, Math.min(1, rate));
    PartyConnection.packetLossFilter = filter || "";

    if (enabled && rate > 0) {
      const filterInfo = filter ? ` (filtered: "${filter}")` : "";
      console.log(`\x1b[35m[PACKET LOSS SIMULATION]\x1b[0m Enabled with ${(rate * 100).toFixed(1)}% loss rate${filterInfo}`);
    } else if (enabled) {
      console.log("\x1b[35m[PACKET LOSS SIMULATION]\x1b[0m Enabled but rate is 0% (no messages will be dropped)");
    } else {
      console.log("\x1b[35m[PACKET LOSS SIMULATION]\x1b[0m Disabled");
    }
  }

  static getPacketLossStatus(): { enabled: boolean; rate: number; filter: string } {
    return {
      enabled: PartyConnection.packetLossEnabled,
      rate: PartyConnection.packetLossRate,
      filter: PartyConnection.packetLossFilter,
    };
  }

  static configureBandwidth(enabled: boolean, kbps: number, filter?: string): void {
    PartyConnection.bandwidthEnabled = enabled;
    PartyConnection.bandwidthKbps = Math.max(1, kbps);
    PartyConnection.bandwidthFilter = filter || "";

    if (enabled && kbps > 0) {
      const filterInfo = filter ? ` (filtered: "${filter}")` : "";
      console.log(`\x1b[35m[BANDWIDTH SIMULATION]\x1b[0m Enabled with ${kbps} kbps bandwidth${filterInfo}`);
    } else if (enabled) {
      console.log("\x1b[35m[BANDWIDTH SIMULATION]\x1b[0m Enabled but bandwidth is 0 kbps (no delay will be applied)");
    } else {
      console.log("\x1b[35m[BANDWIDTH SIMULATION]\x1b[0m Disabled");
    }
  }

  static getBandwidthStatus(): { enabled: boolean; kbps: number; filter: string } {
    return {
      enabled: PartyConnection.bandwidthEnabled,
      kbps: PartyConnection.bandwidthKbps,
      filter: PartyConnection.bandwidthFilter,
    };
  }

  static configureLatency(enabled: boolean, ms: number, filter?: string): void {
    PartyConnection.latencyEnabled = enabled;
    PartyConnection.latencyMs = Math.max(0, ms);
    PartyConnection.latencyFilter = filter || "";

    if (enabled && ms > 0) {
      const filterInfo = filter ? ` (filtered: "${filter}")` : "";
      console.log(`\x1b[35m[LATENCY SIMULATION]\x1b[0m Enabled with ${ms}ms fixed latency${filterInfo}`);
    } else if (enabled) {
      console.log("\x1b[35m[LATENCY SIMULATION]\x1b[0m Enabled but latency is 0ms (no delay will be applied)");
    } else {
      console.log("\x1b[35m[LATENCY SIMULATION]\x1b[0m Disabled");
    }
  }

  static getLatencyStatus(): { enabled: boolean; ms: number; filter: string } {
    return {
      enabled: PartyConnection.latencyEnabled,
      ms: PartyConnection.latencyMs,
      filter: PartyConnection.latencyFilter,
    };
  }
}

export function logNetworkSimulationStatus(): void {
  const packetLossStatus = PartyConnection.getPacketLossStatus();
  const bandwidthStatus = PartyConnection.getBandwidthStatus();
  const latencyStatus = PartyConnection.getLatencyStatus();

  if (packetLossStatus.enabled) {
    const filterInfo = packetLossStatus.filter ? ` (filter: "${packetLossStatus.filter}")` : "";
    console.log(
      `\x1b[36m[NETWORK SIMULATION]\x1b[0m Packet loss simulation: ${(packetLossStatus.rate * 100).toFixed(1)}% loss rate${filterInfo}`,
    );
  } else {
    console.log("\x1b[36m[NETWORK SIMULATION]\x1b[0m Packet loss simulation: disabled");
  }

  if (bandwidthStatus.enabled) {
    const filterInfo = bandwidthStatus.filter ? ` (filter: "${bandwidthStatus.filter}")` : "";
    console.log(`\x1b[36m[NETWORK SIMULATION]\x1b[0m Bandwidth simulation: ${bandwidthStatus.kbps} kbps${filterInfo}`);
  } else {
    console.log("\x1b[36m[NETWORK SIMULATION]\x1b[0m Bandwidth simulation: disabled");
  }

  if (latencyStatus.enabled) {
    const filterInfo = latencyStatus.filter ? ` (filter: "${latencyStatus.filter}")` : "";
    console.log(`\x1b[36m[NETWORK SIMULATION]\x1b[0m Latency simulation: ${latencyStatus.ms}ms ping${filterInfo}`);
  } else {
    console.log("\x1b[36m[NETWORK SIMULATION]\x1b[0m Latency simulation: disabled");
  }
}
