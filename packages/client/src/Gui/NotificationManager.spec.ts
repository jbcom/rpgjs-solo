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
    const t = vi.fn((key: string, params?: Record<string, unknown>) =>
      key === "reward.items"
        ? `Recibiste ${params?.count} unidades de ${params?.item}`
        : key
    );
    const manager = new NotificationManager();

    manager.add(
      {
        message: {
          key: "reward.items",
          params: { count: 3, item: "Poción" },
        },
      },
      { t }
    );

    expect(t).toHaveBeenCalledWith("reward.items", {
      count: 3,
      item: "Poción",
    });
    expect(manager.stack()[0]?.message).toBe("Recibiste 3 unidades de Poción");
  });

  test("falls back to the stable key when no translator is available", () => {
    expect(resolveNotificationMessage({ key: "reward.missing" })).toBe("reward.missing");
  });
});
