import { describe, expect, test, vi } from "vitest";
import { AnimationManager } from "./AnimationManager";

describe("AnimationManager", () => {
  test("resolves displayEffect when the component calls onFinish", async () => {
    const manager = new AnimationManager();
    const done = manager.displayEffect({}, { x: 10, y: 20 });

    expect(manager.current()).toHaveLength(1);
    manager.current()[0].onFinish();

    await expect(done).resolves.toBeUndefined();
    expect(manager.current()).toHaveLength(0);
  });

  test("keeps onFinish idempotent and forwards user callback data", async () => {
    const manager = new AnimationManager();
    const onFinish = vi.fn();
    const done = manager.displayEffect({ onFinish }, { x: 10, y: 20 });
    const finish = manager.current()[0].onFinish;

    finish({ ok: true });
    finish({ ok: false });

    await done;
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith({ ok: true });
    expect(manager.current()).toHaveLength(0);
  });
});
