import { describe, expect, test } from "vitest";
import { getGraphicKey } from "../src/graphic-key";

describe("Studio event runtime", () => {
  test("uses the media id before fileName for Studio media graphics", () => {
    expect(
      getGraphicKey({
        _id: "8faef5ea-b787-4e2b-a623-1484141e2f07",
        fileName: "1777648912637-winkhiw5.png",
        metadata: {
          scale: 0.5,
        },
      }),
    ).toBe("8faef5ea-b787-4e2b-a623-1484141e2f07");
  });

  test("keeps fileName fallback for direct graphic assets", () => {
    expect(
      getGraphicKey({
        fileName: "characters/hero.png",
      }),
    ).toBe("characters/hero.png");
  });
});
