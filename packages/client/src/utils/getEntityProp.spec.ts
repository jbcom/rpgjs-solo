import { describe, expect, test } from "vitest";
import { signal } from "canvasengine";
import { getEntityProp } from "./getEntityProp";

const createEntity = () => {
  const name = signal("Alex");

  return {
    _level: signal(5),
    _exp: signal(120),
    _gold: signal(30),
    hpSignal: signal(80),
    spSignal: signal(12),
    type: signal("player"),
    x: signal(10),
    y: signal(20),
    z: signal(0),
    tint: signal(0xffffff),
    direction: signal(2),
    hitbox: signal({ w: 32, h: 48 }),
    animationName: signal("idle"),
    graphics: signal(["hero"]),
    items: signal([{ id: "potion" }]),
    equipments: signal([]),
    states: signal([]),
    skills: signal([]),
    _effects: signal([]),
    componentsTop: signal(["nameplate"]),
    componentsBottom: signal([]),
    componentsCenter: signal([]),
    componentsLeft: signal([]),
    componentsRight: signal([]),
    _param: signal({ maxHp: 100, custom: 7 }),
    get name() {
      return name();
    },
    set name(value: string) {
      name.set(value);
    },
    get speed() {
      return 4;
    },
    get canMove() {
      return true;
    },
  } as any;
};

describe("getEntityProp", () => {
  test("returns undefined until a reactive entity becomes available", () => {
    const entity = signal<any>(undefined);
    const hp = getEntityProp(entity, "hp");
    const maxHp = getEntityProp(entity, "params.maxHp");

    expect(hp()).toBeUndefined();
    expect(maxHp()).toBeUndefined();

    const current = createEntity();
    entity.set(current);

    expect(hp()).toBe(80);
    expect(maxHp()).toBe(100);

    const next = createEntity();
    next.hpSignal.set(42);
    next._param.set({ maxHp: 90 });
    entity.set(next);

    expect(hp()).toBe(42);
    expect(maxHp()).toBe(90);
  });

  test("reads built-in, param and unknown keys without throwing", () => {
    const entity = createEntity();

    expect(getEntityProp(entity, "name")()).toBe("Alex");
    expect(getEntityProp(entity, "componentsTop")()).toEqual(["nameplate"]);
    expect(getEntityProp(entity, "params.custom")()).toBe(7);
    expect(getEntityProp(entity, "params.missing")()).toBeUndefined();
    expect(getEntityProp(entity, "unknown" as any)()).toBeUndefined();
  });
});
