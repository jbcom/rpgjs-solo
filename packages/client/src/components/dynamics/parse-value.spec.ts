import { describe, expect, test } from "vitest";
import { signal } from "canvasengine";
import { resolveDynamicProps, resolveDynamicValue } from "./parse-value";

describe("dynamic component values", () => {
  test("resolves player properties and keeps bar placeholders for the bar renderer", () => {
    const object = {
      _name: signal("Alex"),
      _speed: signal(4),
      _canMove: signal(true),
      hpSignal: signal(100),
      _param: signal({ maxHp: 120 }),
      get name() {
        return this._name();
      },
      set name(value: string) {
        this._name.set(value);
      },
      get speed() {
        return this._speed();
      },
      set speed(value: number) {
        this._speed.set(value);
      },
      get canMove() {
        return this._canMove();
      },
      set canMove(value: boolean) {
        this._canMove.set(value);
      }
    };

    expect(resolveDynamicValue("HP: {hp}/{param.maxHp} {name} {speed} {canMove} {$current}", object)).toBe("HP: 100/120 Alex 4 true {$current}");
  });

  test("keeps resolved props reactive", () => {
    const object = {
      _name: signal("Alex"),
      _speed: signal(4),
      _canMove: signal(true),
      hpSignal: signal(100),
      _param: signal({ maxHp: 120 }),
      get name() {
        return this._name();
      },
      set name(value: string) {
        this._name.set(value);
      },
      get speed() {
        return this._speed();
      },
      set speed(value: number) {
        this._speed.set(value);
      },
      get canMove() {
        return this._canMove();
      },
      set canMove(value: boolean) {
        this._canMove.set(value);
      }
    };
    const props: any = resolveDynamicProps({
      value: "HP: {hp} {name} {speed} {canMove}",
      text: "{$current}/{$max} {name}",
      style: {
        width: "{hp}"
      }
    }, object);

    expect(props.value()).toBe("HP: 100 Alex 4 true");
    expect(props.text()).toBe("{$current}/{$max} Alex");
    expect(props.style()).toEqual({ width: "100" });

    object.hpSignal.set(10);
    object.name = "Sam";
    object.speed = 6;
    object.canMove = false;

    expect(props.value()).toBe("HP: 10 Sam 6 false");
    expect(props.text()).toBe("{$current}/{$max} Sam");
    expect(props.style()).toEqual({ width: "10" });
  });
});
