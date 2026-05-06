import { describe, expect, test } from "vitest";
import { weatherStateSchema } from "../runtime/schemas/weather";
import { mergeWeatherState, normalizeWeatherState, toCanvasWeatherOptions } from "../runtime/weather";

describe("Studio weather runtime", () => {
  test("keeps fog parameters used by the CanvasEngine Weather preset", () => {
    expect(
      toCanvasWeatherOptions({
        effect: "fog",
        preset: "rpgMorningMist",
        params: {
          density: 0.75,
          speed: 0.16,
          windDirection: 0,
          windStrength: 0.2,
          maxDrops: 80,
          scale: 1.35,
          height: 0.45,
          opacity: 0.7,
          sunIntensity: 0,
          sunAngle: 0.9,
          raySpread: 1,
          rayTwinkle: 0,
          rayTwinkleSpeed: 1,
        },
        transitionMs: 0,
        startedAt: 1778053341493,
      })
    ).toMatchObject({
      effect: "fog",
      density: 0.75,
      speed: 0.16,
      scale: 1.35,
      height: 0.45,
      alpha: 0.7,
      zIndex: 1000,
    });
  });

  test("keeps cloud as a CanvasEngine weather effect", () => {
    expect(
      toCanvasWeatherOptions({
        effect: "cloud",
        preset: "goldenHourRays",
        params: {
          sunIntensity: 1,
          rayTwinkle: 0.5,
        },
      })
    ).toMatchObject({
      effect: "cloud",
      sunIntensity: 1,
      rayTwinkle: 0.5,
    });
  });

  test("does not let an incompatible preset override the selected effect", () => {
    expect(
      normalizeWeatherState({
        effect: "snow",
        preset: "rpgMorningMist",
        params: {
          density: 150,
        },
      })
    ).toMatchObject({
      effect: "snow",
      preset: undefined,
      params: {
        density: 150,
      },
    });
  });

  test("drops the previous preset when patching to another effect", () => {
    expect(
      mergeWeatherState(
        {
          effect: "fog",
          preset: "rpgMorningMist",
          params: {
            density: 0.75,
          },
        },
        {
          effect: "snow",
          params: {
            density: 150,
          },
        }
      )
    ).toMatchObject({
      effect: "snow",
      preset: undefined,
      params: {
        density: 150,
      },
    });
  });

  test("generates preset labels and filters presets by effect in Studio schema", () => {
    const snowRule = weatherStateSchema.allOf.find((rule: any) => {
      return rule.if?.properties?.effect?.const === "snow";
    }) as any;
    const snowPreset = snowRule.then.properties.preset;

    expect(snowPreset.enum).toEqual(["custom", "lightSnow", "winterSnow", "blizzardSnow"]);
    expect(snowPreset.format.labels).toEqual(["Custom", "Light Snow", "Winter Snow", "Blizzard Snow"]);
    expect(snowPreset.enum).not.toContain("rpgMorningMist");
  });
});
