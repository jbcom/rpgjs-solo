import { describe, expect, test } from "vitest";
import {
  directionToActionBattleTarget,
  getActionBattleDirectionalTargetBoundary,
  getActionBattleDirectionalTileRange,
  getActionBattleEntityTile,
  getActionBattleTileSize,
  parseAoeMask,
  resolveActionBattleAoeCells,
  resolveActionBattleAoeTarget,
  resolveActionBattleSoftTarget,
} from "./targeting";

const entity = (id: string, x: number, y: number) => ({
  id,
  x: () => x,
  y: () => y,
  hitbox: () => ({ w: 32, h: 32 }),
});

describe("action battle soft targeting", () => {
  test("parses legacy binary area masks without treating zeroes as active cells", () => {
    expect(parseAoeMask(["010", "111", "010"]).cells).toEqual([
      { dx: 0, dy: -1 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 0 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
    ]);
  });

  test("selects the closest target inside the facing cone", () => {
    const source = entity("hero", 0, 0);
    const close = entity("close", 48, 0);
    const far = entity("far", 90, 0);

    expect(
      resolveActionBattleSoftTarget(source, [far, close], "right")?.target
    ).toBe(close);
  });

  test("does not select targets behind the player", () => {
    const source = entity("hero", 0, 0);
    const behind = entity("behind", -40, 0);

    expect(
      resolveActionBattleSoftTarget(source, [behind], "right")
    ).toBeNull();
  });

  test("resolves a cardinal attack direction toward the selected target", () => {
    expect(
      directionToActionBattleTarget(
        entity("hero", 0, 0),
        entity("enemy", 12, -60)
      )
    ).toBe("up");
  });

  test("finds a legal offset center when an area mask has a hole", () => {
    const mask = ["010", "101", "010"];
    const target = resolveActionBattleAoeTarget(
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      1,
      mask
    );

    expect(target).toEqual({ x: 1, y: 0 });
    expect(resolveActionBattleAoeCells(target!, mask)).toContainEqual({
      x: 2,
      y: 0,
    });
  });

  test("rejects an area target when no mask cell can cover it in range", () => {
    expect(
      resolveActionBattleAoeTarget(
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        1,
        ["#"]
      )
    ).toBeNull();
  });

  test("derives entity coordinates from map tiles rather than hitbox size", () => {
    const tileSize = getActionBattleTileSize({
      tileWidth: 16,
      tileHeight: 24,
    });
    const target = {
      x: () => 16,
      y: () => 24,
      hitbox: () => ({ w: 8, h: 8 }),
    };

    expect(getActionBattleEntityTile(target, tileSize)).toEqual({ x: 1, y: 1 });
  });

  test("honors one shared targeting tile override on client and server", () => {
    expect(
      getActionBattleTileSize(
        { tileWidth: 32, tileHeight: 32 },
        { width: 10, height: 14 },
      ),
    ).toEqual({ width: 10, height: 14 });
  });

  test("converts tile range through rectangular geometry in the firing direction", () => {
    const tileSize = { width: 10, height: 24 };

    expect(getActionBattleDirectionalTileRange(3, tileSize, "right")).toBe(30);
    expect(getActionBattleDirectionalTileRange(3, tileSize, "up")).toBe(72);
    expect(
      getActionBattleDirectionalTileRange(3, tileSize, { x: 1, y: 1 }),
    ).toBeCloseTo((3 * Math.SQRT2) / (1 / 10 + 1 / 24), 8);
  });

  test("uses the candidate direction for rectangular soft-target eligibility", () => {
    const source = entity("hero", 0, 0);
    const outside = entity("outside", 26, 12);
    const boundary = {
      tileRange: 3,
      tileSize: { width: 10, height: 24 },
    };
    const measured = getActionBattleDirectionalTargetBoundary(
      source,
      outside,
      boundary,
    );

    expect(measured.distance).toBeCloseTo(Math.hypot(26, 12));
    expect(measured.eligible).toBe(false);
    expect(
      resolveActionBattleSoftTarget(
        source,
        [outside],
        "right",
        { coneDegrees: 180 },
        boundary,
      ),
    ).toBeNull();

    const legal = entity("legal", 24, 12);
    expect(
      resolveActionBattleSoftTarget(
        source,
        [legal, outside],
        "right",
        { coneDegrees: 180 },
        boundary,
      )?.target,
    ).toBe(legal);
  });

  test("requires explicit projectile directions to align with the candidate", () => {
    const source = entity("hero", 0, 0);
    const offAxis = entity("off-axis", 0, 20);
    const aligned = entity("aligned", 20, 0);
    const boundary = {
      tileRange: 3,
      tileSize: { width: 10, height: 24 },
      direction: { x: 1, y: 0 },
    };

    expect(
      getActionBattleDirectionalTargetBoundary(source, offAxis, boundary),
    ).toMatchObject({
      range: 30,
      aligned: false,
      eligible: false,
    });
    expect(
      resolveActionBattleSoftTarget(
        source,
        [offAxis, aligned],
        boundary.direction,
        { coneDegrees: 180 },
        boundary,
      )?.target,
    ).toBe(aligned);
  });
});
