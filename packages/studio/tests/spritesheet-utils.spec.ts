import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  createSpriteSheetObject,
  resolveSpritesheet,
  STUDIO_DEFAULT_CHARACTER_DISPLAY_SCALE,
} from "../src/spritesheet-utils";

const { getMedia } = vi.hoisted(() => ({
  getMedia: vi.fn(),
}));

vi.mock("../src/data-provider", () => ({
  getGameDataProvider: () => ({
    getMedia,
  }),
}));

describe("Studio spritesheet utils", () => {
  beforeEach(() => {
    getMedia.mockReset();
  });

  test("adds Studio default display scale without changing spritesheet transform scale", async () => {
    const spritesheet = await createSpriteSheetObject({
      type: "character",
      id: "hero",
      fileName: "hero.png",
      metadata: {
        frameWidth: 4,
        frameHeight: 4,
      },
    });

    expect(spritesheet.scale).toEqual([1, 1]);
    expect(spritesheet.displayScale).toBe(STUDIO_DEFAULT_CHARACTER_DISPLAY_SCALE);
  });

  test("keeps explicit Studio media scale", async () => {
    const spritesheet = await createSpriteSheetObject({
      type: "character",
      id: "hero",
      fileName: "hero.png",
      metadata: {
        frameWidth: 4,
        frameHeight: 4,
        scale: 0.75,
      },
    });

    expect(spritesheet.scale).toEqual([0.75, 0.75]);
    expect(spritesheet.displayScale).toBeUndefined();
  });

  test("tries Studio media lookup for file-name graphics before direct asset fallback", async () => {
    getMedia.mockResolvedValue({
      type: "spritesheet",
      id: "media-hero",
      fileName: "hero.png",
      metadata: {
        frameWidth: 3,
        frameHeight: 4,
        scale: 0.5,
      },
    });

    const spritesheet = await resolveSpritesheet("hero.png");

    expect(getMedia).toHaveBeenCalledWith("hero.png");
    expect(spritesheet.framesWidth).toBe(3);
    expect(spritesheet.scale).toEqual([0.5, 0.5]);
  });

  test("keeps direct file-name fallback when Studio media lookup fails", async () => {
    getMedia.mockRejectedValue(new Error("not found"));

    const spritesheet = await resolveSpritesheet("hero.png");

    expect(getMedia).toHaveBeenCalledWith("hero.png");
    expect(spritesheet.framesWidth).toBe(4);
    expect(spritesheet.displayScale).toBe(STUDIO_DEFAULT_CHARACTER_DISPLAY_SCALE);
  });
});
