import { describe, expect, it } from "vitest";
import {
  buildStudioElementSpriteParts,
  resolveStudioElementLightSpotOverlay,
  resolveStudioElementMetrics,
  resolveStudioElementShadowCaster,
  StudioElementRenderer,
} from "./studio-element-renderer";
import {
  resolveStudioTerrainWallShadowStyle,
  resolveTerrainTextureRepeatLocal,
} from "./terrain-renderer/terrain-chunk-renderer";

const createElement = (overrides: Record<string, any> = {}) => ({
  id: "tree",
  rect: [0, 0, 48, 48],
  drawIn: [96, 144, 48, 48],
  hitbox: { x: 12, y: 30, width: 24, height: 14 },
  zIndexOffset: 0,
  hasShadow: true,
  ...overrides,
});

const createTerrainData = (overrides: Record<string, any> = {}) => ({
  widthTiles: 10,
  heightTiles: 8,
  tileSize: 48,
  width: 480,
  height: 384,
  asset: null,
  sourceTexture: "",
  terrainControl: null,
  terrainGrid: [],
  morphologyFeatures: [],
  waterAnimation: { enabled: false, speed: 1, intensity: 0.45 },
  version: "terrain-v1",
  ...overrides,
});

describe("studio element renderer helpers", () => {
  it("repeats terrain texture coordinates without mirroring adjacent tiles", () => {
    expect(resolveTerrainTextureRepeatLocal(0, 48)).toBe(0);
    expect(resolveTerrainTextureRepeatLocal(24, 48)).toBe(0.5);
    expect(resolveTerrainTextureRepeatLocal(48, 48)).toBe(0);
    expect(resolveTerrainTextureRepeatLocal(72, 48)).toBe(0.5);
  });

  it("creates one fallback sprite part when no draw rule is configured", () => {
    const parts = buildStudioElementSpriteParts(createElement());

    expect(parts).toEqual([
      {
        key: "default",
        x: 96,
        y: 144,
        width: 48,
        height: 48,
        sourceRect: { x: 0, y: 0, width: 48, height: 48 },
      },
    ]);
  });

  it("repeats a source rect horizontally for repeat-axis rules", () => {
    const parts = buildStudioElementSpriteParts(
      createElement({
        rect: [0, 0, 16, 16],
        drawIn: [0, 0, 40, 16],
        drawRule: {
          type: "repeat-axis",
          axis: "x",
          rects: {
            body: [0, 0, 16, 16],
          },
        },
      })
    );

    expect(parts).toHaveLength(3);
    expect(parts.map((part) => part.width)).toEqual([16, 16, 8]);
    expect(parts[2].sourceRect.width).toBe(8);
  });

  it("compresses edge-repeat segments when the target is smaller than fixed edges", () => {
    const parts = buildStudioElementSpriteParts(
      createElement({
        rect: [0, 0, 30, 10],
        drawIn: [0, 0, 20, 10],
        drawRule: {
          type: "edge-repeat",
          axis: "x",
          rects: {
            start: [0, 0, 15, 10],
            middle: [15, 0, 1, 10],
            end: [16, 0, 14, 10],
          },
        },
      })
    );

    expect(parts).toHaveLength(2);
    expect(parts[0].width + parts[1].width).toBe(20);
    expect(parts[0].sourceRect.width).toBeLessThan(15);
    expect(parts[1].sourceRect.width).toBeLessThanOrEqual(14);
  });

  it("creates the expected frame-9slice segments", () => {
    const parts = buildStudioElementSpriteParts(
      createElement({
        rect: [0, 0, 30, 30],
        drawIn: [0, 0, 50, 50],
        drawRule: {
          type: "frame-9slice",
          rects: {
            cornerTL: [0, 0, 10, 10],
            cornerTR: [20, 0, 10, 10],
            cornerBL: [0, 20, 10, 10],
            cornerBR: [20, 20, 10, 10],
            edgeT: [10, 0, 10, 10],
            edgeB: [10, 20, 10, 10],
            edgeL: [0, 10, 10, 10],
            edgeR: [20, 10, 10, 10],
            center: [10, 10, 10, 10],
          },
        },
      })
    );

    expect(parts.length).toBeGreaterThanOrEqual(9);
    expect(parts.some((part) => part.x === 10 && part.y === 10)).toBe(true);
  });

  it("uses the hitbox bottom as the sortable z index when a hitbox exists", () => {
    const metrics = resolveStudioElementMetrics(
      createElement({
        drawIn: [10, 20, 96, 96],
        rect: [0, 0, 48, 48],
        hitbox: { x: 8, y: 20, width: 24, height: 12 },
        zIndexOffset: 3,
      })
    );

    expect(metrics.resolvedZIndex).toBe(87);
  });

  it("clamps oversized hitboxes to the rendered element bounds", () => {
    const metrics = resolveStudioElementMetrics(
      createElement({
        drawIn: [10, 20, 96, 96],
        rect: [0, 0, 48, 48],
        hitbox: { x: 0, y: 0, width: 48, height: 80 },
      })
    );

    expect(metrics.hitboxHeight).toBe(48);
    expect(metrics.resolvedZIndex).toBe(116);
  });

  it("respects the shared shadow budget", () => {
    const budget = { remaining: 1 };
    const options = { shadowBudget: budget, lighting: { sun: { intensity: 0.95 } } };
    const first = resolveStudioElementShadowCaster(createElement(), undefined, options);
    const second = resolveStudioElementShadowCaster(createElement(), undefined, options);

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(budget.remaining).toBe(0);
  });

  it("enables element shadow casters from an active map sun", () => {
    const caster = resolveStudioElementShadowCaster(createElement(), undefined, {
      sceneMap: {
        lighting: () => ({ sun: { intensity: 0.95 } }),
      },
    });

    expect(caster?.enabled).toBe(true);
  });

  it("uses projected RPG-style shadow tuning for studio elements", () => {
    const caster = resolveStudioElementShadowCaster(
      createElement({
        drawIn: [96, 144, 48, 48],
        hitbox: { x: 12, y: 30, width: 24, height: 14 },
      }),
      undefined,
      {
        lighting: { sun: { intensity: 0.95 } },
      }
    );

    expect(caster).not.toBeNull();
    if (!caster) throw new Error("Expected element shadow style");
    expect(caster.height).toBeGreaterThan(50);
    expect(caster.alpha).toBeGreaterThan(0.37);
    expect(caster.alpha).toBeLessThan(0.48);
    expect(caster.length).toBeGreaterThan(40);
    expect(caster.length).toBeLessThan(55);
    expect(caster.widthScale).toBeLessThan(0.6);
    expect(caster.contactWidthScale).toBeLessThan(0.9);
    expect(caster.contactAlpha).toBeGreaterThan(0.8);
    expect(caster.contactAlpha).toBeGreaterThan(caster.alpha);
    expect(caster.direction.x).toBeGreaterThan(0);
    expect(caster.direction.y).toBeGreaterThan(0);
    expect(caster.contactY).toBe(44);
  });

  it("keeps the Studio element shadow angle locked to the active sun even near light spots", () => {
    const caster = resolveStudioElementShadowCaster(
      createElement({
        drawIn: [96, 144, 48, 48],
        hitbox: { x: 12, y: 30, width: 24, height: 14 },
      }),
      undefined,
      {
        lighting: {
          sun: { x: -0.45, y: -1, intensity: 0.95 },
          spots: [{ x: 200, y: 110, radius: 240, intensity: 2 }],
        },
      }
    );

    expect(caster).not.toBeNull();
    if (!caster) throw new Error("Expected element shadow style");
    expect(caster.direction.x).toBeCloseTo(0.4104, 3);
    expect(caster.direction.y).toBeCloseTo(0.9119, 3);
  });

  it("creates automatic element shadow casters from an active sun even when the element disabled manual shadows", () => {
    const caster = resolveStudioElementShadowCaster(
      createElement({ hasShadow: false }),
      undefined,
      {
        lighting: { sun: { intensity: 0.95 } },
      }
    );

    expect(caster).not.toBeNull();
    expect(caster?.enabled).toBe(true);
  });

  it("attaches Studio element shadows as a projected silhouette sprite instead of a shadow caster proxy", async () => {
    const renderer = new StudioElementRenderer();
    const [container] = await renderer.renderElements(
      [createElement({ image: "" })],
      { lighting: { sun: { intensity: 0.95 } } }
    );

    const shadow = container.children.find((child: any) => child.label === "StudioElement:tree:shape-shadow") as any;

    expect((container as any).shadowCaster).toBeUndefined();
    expect(shadow).toBeTruthy();
    expect(shadow.shadowCaster).toBeUndefined();
    expect(shadow.__studioShapeShadow?.contactY).toBe(44);
    expect(shadow.__studioShapeShadow?.contactAlpha).toBeGreaterThan(0.8);
    expect(shadow.__studioShapeShadow?.length).toBeGreaterThan(40);
    expect(shadow.__studioShapeShadow?.visualContactWidth).toBeLessThan(24);
    expect(shadow.__studioShapeShadow?.contactOverlap).toBeGreaterThan(2);
    expect(shadow.__studioShapeShadow?.footprintHeight).toBeGreaterThanOrEqual(3);
    expect(shadow.zIndex).toBeLessThan(0);

    renderer.destroy();
  });

  it("anchors the projected silhouette on the hitbox contact center", async () => {
    const renderer = new StudioElementRenderer();
    const [container] = await renderer.renderElements(
      [
        createElement({
          image: "",
          hitbox: { x: 4, y: 30, width: 10, height: 14 },
        }),
      ],
      { lighting: { sun: { intensity: 0.95 } } }
    );

    const shadow = container.children.find((child: any) => child.label === "StudioElement:tree:shape-shadow") as any;

    expect(shadow).toBeTruthy();
    expect(shadow.__studioShapeShadow?.contactX).toBe(9);
    expect(shadow.__studioShapeShadow?.projectedContactX).toBeCloseTo(9, 4);

    renderer.destroy();
  });

  it("does not create element shadow casters without manual shadow or automatic sun shadows", () => {
    const caster = resolveStudioElementShadowCaster(createElement({ hasShadow: false }));

    expect(caster).toBeNull();
  });

  it("keeps explicit shadow disable as an opt-out for sun-driven element shadows", () => {
    const caster = resolveStudioElementShadowCaster(createElement({ hasShadow: false }), undefined, {
      lighting: { sun: { intensity: 0.95 }, shadows: { enabled: false } },
    });

    expect(caster).toBeNull();
  });

  it("resolves a visible light spot overlay from element lightSpot data", () => {
    const overlay = resolveStudioElementLightSpotOverlay(
      createElement({
        drawIn: [100, 200, 96, 96],
        rect: [0, 0, 48, 48],
        lightSpot: {
          enabled: true,
          x: 24,
          y: 12,
          radius: 40,
          intensity: 80,
          style: "soft",
        },
      })
    );

    expect(overlay.enabled).toBe(true);
    expect(overlay.x).toBe(148);
    expect(overlay.y).toBe(224);
    expect(overlay.radius).toBe(80);
    expect(overlay.renderRadius).toBe(132);
    expect(overlay.intensity).toBe(0.8);
    expect(overlay.style).toBe("soft");
  });

  it("resolves static wall shadow style from an active sun", () => {
    const style = resolveStudioTerrainWallShadowStyle(
      createTerrainData(),
      {
        sun: { intensity: 0.95 },
      }
    );

    expect(style).not.toBeNull();
    expect(style?.offsetX).toBeGreaterThan(0);
    expect(style?.offsetY).toBeGreaterThan(0);
    expect(style?.alpha).toBeGreaterThan(0.3);
  });

  it("keeps wall shadow projection independent from sun distance", () => {
    const near = resolveStudioTerrainWallShadowStyle(createTerrainData(), {
      sun: { x: -10, y: -12, z: 120, intensity: 0.95 },
    });
    const far = resolveStudioTerrainWallShadowStyle(createTerrainData(), {
      sun: { x: -9999, y: -9999, z: 1200, intensity: 0.95 },
    });

    expect(near).not.toBeNull();
    expect(far).not.toBeNull();
    expect(near?.offsetX).toBe(far?.offsetX);
    expect(near?.offsetY).toBe(far?.offsetY);
    expect(near?.blur).toBe(far?.blur);
  });

  it("does not resolve wall shadow style when sun shadows are disabled", () => {
    const style = resolveStudioTerrainWallShadowStyle(
      createTerrainData(),
      {
        sun: { intensity: 0.95 },
        shadows: { enabled: false },
      }
    );

    expect(style).toBeNull();
  });
});
