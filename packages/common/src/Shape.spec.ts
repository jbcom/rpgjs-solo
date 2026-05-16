import { describe, expect, test, vi } from "vitest";
import { RpgShape } from "./Shape";

const createShape = (map?: any) =>
  new RpgShape({
    name: "detection",
    positioning: "center",
    width: 32,
    height: 32,
    x: 10,
    y: 20,
    properties: { type: "vision" },
    playerOwner: { id: "owner" } as any,
    physicZoneId: "zone-1",
    map,
  });

describe("RpgShape", () => {
  test("returns its owner and updates position", () => {
    const shape = createShape();

    expect(shape.getPlayerOwner()?.id).toBe("owner");

    shape._updatePosition(40, 60);
    expect(shape.x).toBe(40);
    expect(shape.y).toBe(60);
  });

  test("reports players inside the backing physics zone", () => {
    const getEntitiesInZone = vi.fn(() => [{ uuid: "entity-1" }]);
    const getEntityByUUID = vi.fn(() => ({ uuid: "entity-1" }));
    const shape = createShape({
      physic: {
        getZoneManager: () => ({ getEntitiesInZone }),
        getEntityByUUID,
      },
    });

    expect(shape.playerIsIn({ id: "player-1" } as any)).toBe(true);
    expect(getEntitiesInZone).toHaveBeenCalledWith("zone-1");
    expect(getEntityByUUID).toHaveBeenCalledWith("player-1");
  });

  test("handles missing map, empty zones and missing entities as stable misses", () => {
    expect(createShape().playerIsIn({ id: "player-1" } as any)).toBe(false);

    const emptyZone = createShape({
      physic: {
        getZoneManager: () => ({ getEntitiesInZone: () => [] }),
        getEntityByUUID: () => ({ uuid: "entity-1" }),
      },
    });
    expect(emptyZone.playerIsIn({ id: "player-1" } as any)).toBe(false);

    const missingEntity = createShape({
      physic: {
        getZoneManager: () => ({ getEntitiesInZone: () => [{ uuid: "entity-1" }] }),
        getEntityByUUID: () => undefined,
      },
    });
    expect(missingEntity.playerIsIn({ id: "player-1" } as any)).toBe(false);
  });
});
