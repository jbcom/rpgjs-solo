import { afterEach, describe, expect, test, vi } from "vitest";
import { NotificationManager, resolveNotificationMessage } from "./NotificationManager";

describe("NotificationManager localization", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("preserves literal notification messages", () => {
    expect(resolveNotificationMessage("Quest updated")).toBe("Quest updated");
  });

  test("resolves deferred messages with the client translator and interpolation params", () => {
    vi.useFakeTimers();
    const translateDescriptor = vi.fn(
      (message: { key: string; count?: number }) =>
        `${message.key}:${message.count}`
    );
    const manager = new NotificationManager();

    manager.add(
      {
        message: {
          key: "reward.items",
          count: 3,
          params: { count: 3, item: "Poción" },
        },
      },
      { translateDescriptor }
    );

    expect(translateDescriptor).toHaveBeenCalledWith({
      key: "reward.items",
      count: 3,
      params: { count: 3, item: "Poción" },
    });
    expect(manager.stack()[0]?.message).toBe("reward.items:3");
  });

  test("falls back to the stable key when no translator is available", () => {
    expect(resolveNotificationMessage({ key: "reward.missing" })).toBe("reward.missing");
  });
});
