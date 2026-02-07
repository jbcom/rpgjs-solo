import { describe, expect, it } from "vitest";
import { PredictionController, type PredictionState } from "./PredictionController";

describe("PredictionController", () => {
  it("keeps only unacknowledged inputs after an ack", () => {
    let tick = 10;
    let current: PredictionState<string> = { x: 100, y: 100, direction: "right" };
    const appliedStates: PredictionState<string>[] = [];

    const controller = new PredictionController<string>({
      correctionThreshold: 5,
      getPhysicsTick: () => tick,
      getCurrentState: () => current,
      setAuthoritativeState: (state) => {
        appliedStates.push(state);
        current = state;
      },
    });

    const first = controller.recordInput("right", Date.now());
    tick += 1;
    const second = controller.recordInput("right", Date.now() + 1);

    const ack = controller.applyServerAck({
      frame: first.frame,
      serverTick: 20,
      state: { x: 102, y: 100, direction: "right" },
    });

    expect(ack.acknowledgedFrame).toBe(first.frame);
    expect(ack.acknowledgedTick).toBe(20);
    expect(ack.needsReconciliation).toBe(false);
    expect(ack.pendingInputs.map((entry) => entry.frame)).toEqual([second.frame]);
    expect(appliedStates).toHaveLength(0);
  });

  it("marks ack as needing reconciliation when drift is above threshold", () => {
    const current: PredictionState<string> = { x: 100, y: 100, direction: "right" };

    const controller = new PredictionController<string>({
      correctionThreshold: 5,
      getPhysicsTick: () => 1,
      getCurrentState: () => current,
      setAuthoritativeState: () => {
        // no-op for this unit test
      },
    });

    controller.recordInput("right", Date.now());

    const ack = controller.applyServerAck({
      frame: 1,
      serverTick: 5,
      state: { x: 0, y: 0, direction: "left" },
    });

    expect(ack.needsReconciliation).toBe(true);
    expect(ack.pendingInputs).toHaveLength(0);
  });
});
