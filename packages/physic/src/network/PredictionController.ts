export interface PredictionState<DirectionType = unknown> {
  x: number;
  y: number;
  direction?: DirectionType;
}

export interface PredictionControllerConfig<DirectionType = unknown> {
  correctionThreshold?: number;
  historyTtlMs?: number;
  maxHistoryEntries?: number;
  getPhysicsTick: () => number;
  getCurrentState: () => PredictionState<DirectionType>;
  setAuthoritativeState: (state: PredictionState<DirectionType>) => void;
}

interface PredictionHistoryEntry<DirectionType> {
  frame: number;
  tick: number;
  timestamp: number;
  direction: DirectionType;
  state?: PredictionState<DirectionType>;
}

/**
 * Shared client-side prediction controller.
 *
 * Handles input history, pending server snapshots and reconciliation.
 */
export class PredictionController<DirectionType = unknown> {
  private readonly correctionThreshold: number;
  private readonly historyTtlMs: number;
  private readonly maxHistoryEntries: number;
  private frameCounter = 0;
  private history: PredictionHistoryEntry<DirectionType>[] = [];
  private pendingSnapshot: PredictionState<DirectionType> | null = null;
  private lastAckFrame = 0;
  private lastAckTick = 0;

  constructor(private readonly config: PredictionControllerConfig<DirectionType>) {
    this.correctionThreshold = config.correctionThreshold ?? 5;
    this.historyTtlMs = config.historyTtlMs ?? 2000;
    this.maxHistoryEntries = config.maxHistoryEntries ?? 200;
  }

  recordInput(direction: DirectionType, timestamp: number): { frame: number; tick: number } {
    const frame = ++this.frameCounter;
    const tick = this.config.getPhysicsTick();
    this.history.push({ frame, tick, timestamp, direction });
    this.trimHistory(timestamp);
    return { frame, tick };
  }

  attachPredictedState(frame: number, state: PredictionState<DirectionType>): void {
    const entry = this.history.find((item) => item.frame === frame);
    if (entry) {
      entry.state = state;
    }
  }

  hasPendingInputs(): boolean {
    return this.history.length > 0;
  }

  queueServerSnapshot(snapshot: PredictionState<DirectionType>): void {
    if (this.hasPendingInputs()) {
      this.pendingSnapshot = snapshot;
      return;
    }
    this.applySnapshot(snapshot);
  }

  tryApplyPendingSnapshot(): void {
    if (!this.pendingSnapshot || this.hasPendingInputs()) {
      return;
    }
    this.applySnapshot(this.pendingSnapshot);
    this.pendingSnapshot = null;
  }

  applyServerAck(
    ack: {
      frame: number;
      serverTick?: number;
      state?: PredictionState<DirectionType>;
    },
  ): void {
    if (typeof ack.frame !== "number") {
      return;
    }
    this.lastAckFrame = Math.max(this.lastAckFrame, ack.frame);
    if (typeof ack.serverTick === "number") {
      this.lastAckTick = Math.max(this.lastAckTick, ack.serverTick);
    }
    this.history = this.history.filter((entry) => entry.frame > this.lastAckFrame);
    if (ack.state && !this.hasPendingInputs()) {
      this.applySnapshot(ack.state);
      this.pendingSnapshot = null;
      return;
    }
    if (this.pendingSnapshot && !this.hasPendingInputs()) {
      this.applySnapshot(this.pendingSnapshot);
      this.pendingSnapshot = null;
    }
  }

  cleanup(now: number): void {
    this.trimHistory(now);
  }

  private trimHistory(now: number): void {
    const cutoff = now - this.historyTtlMs;
    this.history = this.history.filter((entry) => entry.timestamp >= cutoff);
    if (this.history.length > this.maxHistoryEntries) {
      this.history = this.history.slice(-this.maxHistoryEntries);
    }
  }

  private applySnapshot(snapshot: PredictionState<DirectionType>): void {
    const current = this.config.getCurrentState();
    const dx = current.x - snapshot.x;
    const dy = current.y - snapshot.y;
    const distance = Math.hypot(dx, dy);
    if (distance > this.correctionThreshold) {
      this.config.setAuthoritativeState(snapshot);
      this.history = [];
      return;
    }
    this.history = [];
  }
}

