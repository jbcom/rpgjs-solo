import { describe, expect, test } from "vitest";
import { signal } from "canvasengine";
import { resolveDynamicProps, resolveDynamicValue } from "./parse-value";

describe("dynamic component values", () => {
  test("resolves player properties and keeps bar placeholders for the bar renderer", () => {
    const object = {
      name: signal("Alex"),
      hpSignal: signal(100),
      _param: signal({ maxHp: 120 })
    };

    expect(resolveDynamicValue("HP: {hp}/{param.maxHp} {name} {$current}", object)).toBe("HP: 100/120 Alex {$current}");
  });

  test("keeps resolved props reactive", () => {
    const object = {
      name: signal("Alex"),
      hpSignal: signal(100),
      _param: signal({ maxHp: 120 })
    };
    const props: any = resolveDynamicProps({
      value: "HP: {hp} {name}",
      text: "{$current}/{$max} {name}",
      style: {
        width: "{hp}"
      }
    }, object);

    expect(props.value()).toBe("HP: 100 Alex");
    expect(props.text()).toBe("{$current}/{$max} Alex");
    expect(props.style()).toEqual({ width: "100" });

    object.hpSignal.set(10);
    object.name.set("Sam");

    expect(props.value()).toBe("HP: 10 Sam");
    expect(props.text()).toBe("{$current}/{$max} Sam");
    expect(props.style()).toEqual({ width: "10" });
  });
});
