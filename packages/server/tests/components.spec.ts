import { describe, expect, test } from "vitest";
import { Components } from "../src/Player/Components";

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
