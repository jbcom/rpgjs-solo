import { describe, expect, test, vi } from "vitest";
import {
  arrayFlat,
  arrayUniq,
  basename,
  extractId,
  hexaToNumber,
  mergeObjectWithMethods,
  random,
  set,
} from "./Utils";

describe("common utils", () => {
  test("normalizes arrays without mutating values", () => {
    expect(arrayUniq(["hero", "npc", "hero", "event"])).toEqual([
      "hero",
      "npc",
      "event",
    ]);
    expect(arrayFlat([[1, 2], [], [3]])).toEqual([1, 2, 3]);
  });

  test("creates nested paths and can force numeric keys to plain objects", () => {
    const withArray: any = {};
    set(withArray, "inventory.0.item.id", "potion");
    expect(withArray).toEqual({ inventory: [{ item: { id: "potion" } }] });

    const withPlainObject: any = {};
    set(withPlainObject, "inventory.0.item.id", "potion", true);
    expect(withPlainObject).toEqual({
      inventory: { "0": { item: { id: "potion" } } },
    });
  });

  test("parses color shorthands and alpha-prefixed hex values", () => {
    expect(hexaToNumber("#abc")).toEqual({ value: 0xaabbcc, alpha: 1 });
    expect(hexaToNumber("#80ff0000")).toEqual({
      value: 0xff0000,
      alpha: 128 / 255,
    });
  });

  test("extracts file names and ids from asset paths", () => {
    expect(basename("/assets/characters/hero-id.png")).toBe("hero-id.png");
    expect(extractId("/assets/characters/hero-id.png")).toBe("hero-id");
    expect(extractId("/assets/characters/no-extension")).toBeNull();
  });

  test("keeps random values inside inclusive bounds", () => {
    vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValueOnce(0.999);

    expect(random(3, 7)).toBe(3);
    expect(random(3, 7)).toBe(7);
  });

  test("merges class instances without losing methods or descriptors", () => {
    class Inventory {
      private items = ["potion"];

      get size() {
        return this.items.length;
      }

      has(item: string) {
        return this.items.includes(item);
      }
    }

    const target = { owner: "Alex" };
    const merged = mergeObjectWithMethods(target, new Inventory());

    expect(merged.owner).toBe("Alex");
    expect(merged.size).toBe(1);
    expect(merged.has("potion")).toBe(true);
  });
});
