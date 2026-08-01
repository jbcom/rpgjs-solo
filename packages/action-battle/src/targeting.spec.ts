import { describe, expect, test } from "vitest";
import {
  directionToActionBattleTarget,
  getActionBattleDirectionalTargetBoundary,
  getActionBattleDirectionalTileRange,
  getActionBattleEntityTile,
  getActionBattleProjectileTargetIntersection,
  getActionBattleTileSize,
  parseAoeMask,
  resolveActionBattleAoeCells,
  resolveActionBattleAoeTarget,
  resolveActionBattleProjectileGeometry,
  resolveActionBattleSoftTarget,
} from "./targeting";

const entity = (id: string, x: number, y: number, size = 32) => ({
  id,
  x: () => x,
  y: () => y,
  hitbox: () => ({ w: size, h: size }),
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

  test("keeps the facing cone for target-inferred projectile rays", () => {
    const source = entity("hero", 0, 0);
    const behind = entity("behind", -40, 0);
    const boundary = {
      tileRange: 10,
      tileSize: { width: 10, height: 10 },
    };

    expect(
      resolveActionBattleSoftTarget(
        source,
        [behind],
        "right",
        { coneDegrees: 110 },
        boundary,
      ),
    ).toBeNull();
    expect(
      getActionBattleDirectionalTargetBoundary(source, behind, boundary),
    ).toMatchObject({ eligible: true, fixedRay: false });
  });

  test("lets an explicitly fixed authored ray override the facing cone", () => {
    const source = entity("hero", 0, 0);
    const behind = entity("behind", -40, 0);
    const boundary = {
      tileRange: 10,
      tileSize: { width: 10, height: 10 },
      direction: { x: -1, y: 0 },
    };

    expect(
      resolveActionBattleSoftTarget(
        source,
        [behind],
        "right",
        { coneDegrees: 110 },
        boundary,
      )?.target,
    ).toBe(behind);
    expect(
      getActionBattleDirectionalTargetBoundary(source, behind, boundary),
    ).toMatchObject({ eligible: true, fixedRay: true });
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
    const source = entity("hero", 0, 0, 8);
    const outside = entity("outside", 32, 12, 8);
    const boundary = {
      tileRange: 3,
      tileSize: { width: 10, height: 24 },
    };
    const measured = getActionBattleDirectionalTargetBoundary(
      source,
      outside,
      boundary,
    );

    expect(measured.distance).toBeCloseTo(Math.hypot(32, 12));
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

    const legal = entity("legal", 29, 12, 8);
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

  test("admits collider intersections rather than exact centerlines", () => {
    const source = entity("hero", 0, 0, 8);
    const onePixelOffset = entity("offset", 20, 1, 8);
    const vertical = entity("vertical", 0, 20, 8);
    const horizontal = entity("horizontal", 20, 0, 8);
    const boundary = {
      tileRange: 3,
      tileSize: { width: 10, height: 24 },
      direction: { x: 1, y: 0 },
    };

    expect(getActionBattleDirectionalTargetBoundary(
      source,
      onePixelOffset,
      boundary,
    ).eligible).toBe(true);
    expect(getActionBattleDirectionalTargetBoundary(
      source,
      vertical,
      boundary,
    ).eligible).toBe(false);
    expect(getActionBattleDirectionalTargetBoundary(
      source,
      horizontal,
      boundary,
    ).eligible).toBe(true);
  });

  test("shares authored origin, arbitrary direction, overlap, and projectile radius", () => {
    const source = entity("hero", 0, 0, 8);
    const authoredTarget = entity("authored", 20, 20, 8);
    const authored = resolveActionBattleProjectileGeometry({
      source,
      target: authoredTarget,
      projectile: {
        origin: { x: 0, y: 24 },
        direction: { x: 7, y: 0 },
        trajectory: { range: 30 },
      },
      tileSize: { width: 10, height: 24 },
    });
    expect(authored).toMatchObject({
      origin: { x: 0, y: 24 },
      direction: { x: 1, y: 0 },
      range: 30,
    });
    expect(getActionBattleProjectileTargetIntersection(
      authored,
      authoredTarget,
    )).not.toBeNull();

    const overlap = entity("overlap", 0, 0, 8);
    const overlapGeometry = resolveActionBattleProjectileGeometry({
      source,
      target: overlap,
      projectile: { direction: { x: 1, y: 1 }, range: 1 },
      tileSize: { width: 10, height: 24 },
    });
    expect(overlapGeometry.direction.x).toBeCloseTo(Math.SQRT1_2);
    expect(overlapGeometry.direction.y).toBeCloseTo(Math.SQRT1_2);
    expect(getActionBattleProjectileTargetIntersection(
      overlapGeometry,
      overlap,
    )?.distance).toBe(0);

    const laterallyOffset = {
      id: "wide-hit",
      x: () => 20,
      y: () => 1,
      hitbox: () => ({ w: 8, h: 8 }),
    };
    const pointRay = resolveActionBattleProjectileGeometry({
      source: {
        id: "origin",
        x: () => -4,
        y: () => -4,
        hitbox: () => ({ w: 8, h: 8 }),
      },
      target: laterallyOffset,
      projectile: { direction: { x: 1, y: 0 }, range: 40 },
      tileSize: { width: 10, height: 24 },
    });
    expect(getActionBattleProjectileTargetIntersection(
      pointRay,
      laterallyOffset,
    )).toBeNull();
    expect(getActionBattleProjectileTargetIntersection(
      { ...pointRay, radius: 1, width: 2, shape: "capsule" },
      laterallyOffset,
    )).not.toBeNull();
  });

  test("resolves collision size by radius, then width, then height", () => {
    const source = entity("hero", 0, 0, 8);
    const resolve = (collision: { radius?: number; width?: number; height?: number }) =>
      resolveActionBattleProjectileGeometry({
        source,
        projectile: { direction: "right", collision },
        tileSize: { width: 16, height: 16 },
      });

    expect(resolve({ radius: 3, width: 20, height: 100 }).radius).toBe(3);
    expect(resolve({ width: 4, height: 100 }).radius).toBe(2);
    expect(resolve({ height: 10 }).radius).toBe(5);
  });
});
