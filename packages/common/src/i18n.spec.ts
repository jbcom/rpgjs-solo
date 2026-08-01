import { describe, expect, test } from "vitest";
import { Context, injector } from "@signe/di";
import {
  createI18nProvider,
  getOrCreateI18nService,
  I18nService,
  isI18nMessageDescriptor,
  registerI18nMessages,
} from "./i18n";

describe("i18n service", () => {
  test("recognizes deferred translation descriptors without mistaking literal text for one", () => {
    expect(isI18nMessageDescriptor({ key: "reward.item", params: { count: 2 } })).toBe(true);
    expect(isI18nMessageDescriptor("reward.item")).toBe(false);
    expect(isI18nMessageDescriptor({ params: { count: 2 } })).toBe(false);
    expect(
      isI18nMessageDescriptor({ key: "reward.item", params: { count: 1n } })
    ).toBe(false);
    expect(
      isI18nMessageDescriptor({ key: "reward.item", params: { format: () => "x" } })
    ).toBe(false);
    expect(isI18nMessageDescriptor({ key: "reward.item", count: NaN })).toBe(false);
    const cyclic: Record<string, unknown> = { key: "reward.item" };
    cyclic.params = { nested: cyclic };
    expect(isI18nMessageDescriptor(cyclic)).toBe(false);
  });

  test("selects locale plural categories and resolves nested message params", () => {
    const service = new I18nService({
      defaultLocale: "ru",
      fallbackLocale: "en",
      messages: {
        en: {
          "reward.item.other": "Received {count} {item}",
          "item.potion": "Potion",
        },
        ru: {
          "reward.item.one": "Получен {count} {item}",
          "reward.item.few": "Получено {count} предмета: {item}",
          "reward.item.many": "Получено {count} предметов: {item}",
          "item.potion": "Зелье",
        },
      },
    });
    const message = (count: number) =>
      service.translateDescriptor({
        key: "reward.item",
        count,
        params: { count, item: { key: "item.potion" } },
      });

    expect(message(1)).toBe("Получен 1 Зелье");
    expect(message(2)).toBe("Получено 2 предмета: Зелье");
    expect(message(5)).toBe("Получено 5 предметов: Зелье");
  });

  test("translates with fallback locale and raw key fallback", () => {
    const service = getOrCreateI18nService(null, {
      defaultLocale: "fr",
      fallbackLocale: "en",
      messages: {
        en: {
          "npc.hello": "Hello {name}",
          "npc.only-en": "Only English",
        },
        fr: {
          "npc.hello": "Bonjour {name}",
        },
      },
    });

    expect(service.t("npc.hello", { name: "Alex" }, "fr")).toBe("Bonjour Alex");
    expect(service.t("npc.only-en", undefined, "fr")).toBe("Only English");
    expect(service.t("npc.missing", undefined, "fr")).toBe("npc.missing");
  });

  test("lets game messages override module messages", async () => {
    const context = new Context();

    registerI18nMessages(context, {
      fr: {
        "module.title": "Titre du module",
      },
    }, "module", 10);

    await injector(context, [
      createI18nProvider({
        defaultLocale: "fr",
        messages: {
          fr: {
            "module.title": "Titre du jeu",
          },
        },
      }),
    ]);

    const service = getOrCreateI18nService(context);
    expect(service.t("module.title", undefined, "fr")).toBe("Titre du jeu");
  });
});
