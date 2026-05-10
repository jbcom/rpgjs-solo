import { describe, expect, test } from "vitest";
import { Components } from "../src/Player/Components";
import { WithComponentManager } from "../src/Player/ComponentManager";
import { signal } from "@signe/reactive";

class BasePlayer {
  graphics = signal<Array<string | number>>([]);
  componentsTop = signal<string | null>(null);
  componentsCenter = signal<string | null>(null);
  componentsBottom = signal<string | null>(null);
  componentsLeft = signal<string | null>(null);
  componentsRight = signal<string | null>(null);
}

const ComponentPlayer = WithComponentManager(BasePlayer as any) as any;

const readPayload = (value: string | null) => value ? JSON.parse(value) : null;

describe("Components helpers", () => {
  test("creates hp and sp bars with defaults that can be overridden", () => {
    const hpBar = Components.hpBar();
    const spBar = Components.spBar();
    const customHpBar = Components.hpBar({ fillColor: "#111111", width: 80 }, "{$percent}%");

    expect(hpBar).toMatchObject({
      type: "hpBar",
      id: "rpg:hpBar",
      props: {
        current: "{hp}",
        max: "{param.maxHp}",
        style: {
          fillColor: "#ef4444"
        }
      },
      style: {
        fillColor: "#ef4444"
      }
    });
    expect(spBar.props.style).toEqual({ fillColor: "#3b82f6" });
    expect(customHpBar.props.style).toEqual({ fillColor: "#111111", width: 80 });
    expect(customHpBar.props.text).toBe("{$percent}%");
  });

  test("omits text when bar text is null", () => {
    const hpBar = Components.hpBar({}, null);

    expect(hpBar.props.text).toBeUndefined();
    expect(hpBar.text).toBeUndefined();
  });

  test("creates custom bars with template paths", () => {
    expect(Components.bar("wood", "param.maxWood").props).toMatchObject({
      current: "{wood}",
      max: "{param.maxWood}"
    });
    expect(Components.bar("{mana}", "{param.maxMana}").props).toMatchObject({
      current: "{mana}",
      max: "{param.maxMana}"
    });
  });

  test("accepts rect shapes", () => {
    expect(Components.shape({
      type: "rect",
      width: 32,
      height: 32,
      fill: "#ff0000",
      opacity: 0.5
    })).toEqual({
      type: "shape",
      id: "rpg:shape",
      props: {
        type: "rect",
        width: 32,
        height: 32,
        fill: "#ff0000",
        opacity: 0.5
      },
      value: {
        type: "rect",
        width: 32,
        height: 32,
        fill: "#ff0000",
        opacity: 0.5
      }
    });
  });
});

describe("ComponentManager", () => {
  test("setComponentsTop normalizes a single component with layout options", () => {
    const player = new ComponentPlayer();
    const component = Components.text("{name}");

    player.setComponentsTop(component, { width: 80, marginBottom: 8 });

    expect(readPayload(player.componentsTop())).toEqual({
      components: [[component]],
      layout: { width: 80, marginBottom: 8 }
    });
  });

  test("setComponentsBottom normalizes vertical lists and keeps hitbox layout options", () => {
    const player = new ComponentPlayer();
    const shape = Components.shape({
      type: "rect",
      width: 32,
      height: 32,
      fill: "#ff0000",
      opacity: 0.5
    });

    player.setComponentsBottom([shape, Components.hpBar()], { marginBottom: 16 });

    expect(readPayload(player.componentsBottom())).toEqual({
      components: [[shape], [Components.hpBar()]],
      layout: { marginBottom: 16 }
    });
  });

  test("setComponentsLeft, center and right keep table layouts", () => {
    const player = new ComponentPlayer();
    const table = [[Components.text("{name}"), Components.spBar()]];

    player.setComponentsLeft(table, { marginRight: 2 });
    player.setComponentsCenter(table, { width: 100 });
    player.setComponentsRight(table, { marginLeft: 4 });

    expect(readPayload(player.componentsLeft())).toEqual({
      components: table,
      layout: { marginRight: 2 }
    });
    expect(readPayload(player.componentsCenter())).toEqual({
      components: table,
      layout: { width: 100 }
    });
    expect(readPayload(player.componentsRight())).toEqual({
      components: table,
      layout: { marginLeft: 4 }
    });
  });

  test("mergeComponents appends normalized rows and merges layout options", () => {
    const player = new ComponentPlayer();

    player.setComponentsTop([Components.text("{name}")], { width: 80, marginBottom: 4 });
    player.mergeComponents("top", [Components.hpBar()], { marginBottom: 8 });

    expect(readPayload(player.componentsTop())).toEqual({
      components: [[Components.text("{name}")], [Components.hpBar()]],
      layout: { width: 80, marginBottom: 8 }
    });
  });

  test("removeComponents clears the selected component position", () => {
    const player = new ComponentPlayer();

    player.setComponentsTop(Components.text("{name}"));
    player.setComponentsBottom(Components.hpBar());

    player.removeComponents("top");

    expect(player.componentsTop()).toBeNull();
    expect(readPayload(player.componentsBottom())).toEqual({
      components: [[Components.hpBar()]],
      layout: {}
    });
  });

  test("setGraphic accepts sprite ids, legacy tile ids and mixed arrays", () => {
    const player = new ComponentPlayer();

    player.setGraphic("hero");
    expect(player.graphics()).toEqual(["hero"]);

    player.setGraphic(3);
    expect(player.graphics()).toEqual([3]);

    player.setGraphic(["hero-idle", 4, "hero-run"]);
    expect(player.graphics()).toEqual(["hero-idle", 4, "hero-run"]);
  });
});
