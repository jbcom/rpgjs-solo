import { describe, expect, it } from "vitest";
import {
  DEFAULT_DAY_LIGHTING,
  hasActiveLightingSun,
  hasAutoLightingSunShadows,
  shouldRenderLightingShadows,
} from "./lighting";

describe("lighting shadow helpers", () => {
  it("detects active sun only when a sun is configured and enabled", () => {
    expect(hasActiveLightingSun(null)).toBe(false);
    expect(hasActiveLightingSun({ sun: { intensity: 0.9 } })).toBe(true);
    expect(hasActiveLightingSun({ sun: { intensity: 0 } })).toBe(false);
    expect(hasActiveLightingSun({ sun: { enabled: false, intensity: 1 } })).toBe(false);
  });

  it("enables automatic sun shadows unless shadows are explicitly disabled", () => {
    expect(hasAutoLightingSunShadows({ sun: { intensity: 0.95 } })).toBe(true);
    expect(hasAutoLightingSunShadows({ sun: { intensity: 0.95 }, shadows: { enabled: true } })).toBe(true);
    expect(hasAutoLightingSunShadows({ sun: { intensity: 0.95 }, shadows: { enabled: false } })).toBe(false);
  });

  it("keeps light spots as shadow triggers even when automatic sun shadows are disabled", () => {
    expect(shouldRenderLightingShadows({ spots: [{ x: 10, y: 20 }], shadows: { enabled: false } })).toBe(true);
    expect(shouldRenderLightingShadows({ sun: { intensity: 0.95 }, shadows: { enabled: false } })).toBe(false);
    expect(shouldRenderLightingShadows({ sun: { intensity: 0.95 } })).toBe(true);
    expect(shouldRenderLightingShadows(DEFAULT_DAY_LIGHTING)).toBe(false);
  });
});
