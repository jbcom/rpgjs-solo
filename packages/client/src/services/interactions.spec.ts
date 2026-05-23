import { describe, expect, test, vi } from "vitest";
import {
  dragToTile,
  hoverPopover,
  RpgClientInteractions,
  selectable,
} from "./interactions";
import { createClientPointerContext } from "./pointerContext";

function createClient() {
  const client = {
    pointer: createClientPointerContext(),
    processAction: vi.fn(),
    sceneMap: {
      tileWidth: 16,
      tileHeight: 16,
    },
  } as any;
  client.interactions = new RpgClientInteractions(client);
  return client;
}

describe("RpgClientInteractions", () => {
  test("renders registered components with sprite state and bounds", () => {
    const client = createClient();
    const Popover = () => null;
    const sprite = { id: "event-1", name: "Guard" };

    client.interactions.use("Guard", hoverPopover(Popover, { label: "Talk" }));
    client.interactions.handle(sprite, "pointerover", {
      bounds: {
        graphic: { left: 1, top: 2, right: 11, bottom: 22, width: 10, height: 20, centerX: 6, centerY: 12 } as any,
      },
    });

    const entries = client.interactions.getRenderedComponents(sprite, {
      graphic: { left: 1, top: 2, right: 11, bottom: 22, width: 10, height: 20, centerX: 6, centerY: 12 } as any,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].component).toBe(Popover);
    expect(entries[0].props.label).toBe("Talk");
    expect(entries[0].props.state.hovered).toBe(true);
    expect(entries[0].props.bounds.centerX).toBe(6);
  });

  test("keeps clicks client-only unless a behavior sends an action", () => {
    const client = createClient();
    const sprite = { id: "event-1", name: "Guard" };

    client.interactions.use("Guard", selectable());
    client.interactions.handle(sprite, "click");

    expect(client.interactions.getState(sprite).selected).toBe(true);
    expect(client.processAction).not.toHaveBeenCalled();

    client.interactions.use("Guard", {
      click(ctx) {
        ctx.action("guard:talk", { eventId: ctx.target.id });
      },
    });
    client.interactions.handle(sprite, "click");

    expect(client.processAction).toHaveBeenCalledWith("guard:talk", { eventId: "event-1" });
  });

  test("uses behavior hit tests before changing hover state", () => {
    const client = createClient();
    const sprite = { id: "event-1", name: "Tree" };

    client.pointer.update({ x: 0, y: 0 }, { x: 40, y: 40 });
    client.interactions.use("Tree", {
      cursor: "pointer",
      hitTest(ctx) {
        return ctx.bounds("hitbox").contains(ctx.pointer.world());
      },
    });

    client.interactions.handle(sprite, "pointerover", {
      bounds: {
        hitbox: { left: 0, top: 0, right: 16, bottom: 16, width: 16, height: 16, centerX: 8, centerY: 8 } as any,
      },
    });

    expect(client.interactions.getState(sprite).hovered).toBe(false);
    expect(client.interactions.cursorFor(sprite, {
      hitbox: { left: 0, top: 0, right: 16, bottom: 16, width: 16, height: 16, centerX: 8, centerY: 8 } as any,
    })).toBeUndefined();
  });

  test("runs drag lifecycle and resolves pointer tile on drop", () => {
    const client = createClient();
    const sprite = { id: "crate-1", name: "Crate" };

    client.interactions.use("Crate", dragToTile({ action: "crate:move" }));
    client.pointer.update({ x: 0, y: 0 }, { x: 18, y: 35 });
    client.interactions.handle(sprite, "pointerdown");

    expect(client.interactions.getState(sprite).dragging).toBe(true);

    client.pointer.update({ x: 0, y: 0 }, { x: 33, y: 47 });
    client.interactions.handlePointerUp();

    expect(client.interactions.getState(sprite).dragging).toBe(false);
    expect(client.processAction).toHaveBeenCalledWith("crate:move", {
      eventId: "crate-1",
      position: {
        x: 2,
        y: 2,
        worldX: 32,
        worldY: 32,
        width: 16,
        height: 16,
      },
    });
  });
});
