export interface QueuedInput<T> {
  frame: number;
  tick: number;
  timestamp: number;
  payload: T;
}

/**
 * Deterministic per-player input buffer.
 *
 * Keeps inputs ordered by frame, deduplicates frames, and allows consuming
 * the queue atomically for each simulation tick.
 */
export class DeterministicInputBuffer<T = unknown> {
  private readonly queues = new Map<string, Map<number, QueuedInput<T>>>();

  enqueue(playerId: string, input: QueuedInput<T>): void {
    if (!this.queues.has(playerId)) {
      this.queues.set(playerId, new Map());
    }
    const queue = this.queues.get(playerId)!;
    queue.set(input.frame, input);
  }

  consume(playerId: string): QueuedInput<T>[] {
    const queue = this.queues.get(playerId);
    if (!queue || queue.size === 0) {
      return [];
    }
    const entries = Array.from(queue.values()).sort((a, b) => a.frame - b.frame);
    queue.clear();
    return entries;
  }

  pendingCount(playerId: string): number {
    return this.queues.get(playerId)?.size ?? 0;
  }

  clear(playerId: string): void {
    this.queues.delete(playerId);
  }

  clearAll(): void {
    this.queues.clear();
  }
}

