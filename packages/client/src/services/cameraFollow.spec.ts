import { describe, expect, it, vi } from "vitest";
import {
  applyCameraFollow,
  cameraFollowAnimationOptions,
  cameraFollowOptions,
} from "./cameraFollow";

const createViewport = () => ({
  animate: vi.fn(),
  follow: vi.fn(),
  plugins: {
    remove: vi.fn(),
  },
});

describe("camera follow", () => {
  it("normalizes transition options from smoothMove", () => {
    expect(cameraFollowAnimationOptions(true)).toEqual({
      time: 1000,
      ease: "easeInOutSine",
    });
    expect(cameraFollowAnimationOptions({ time: 450, ease: "easeInOutQuad" })).toEqual({
      time: 450,
      ease: "easeInOutQuad",
    });
    expect(cameraFollowAnimationOptions({ time: 450, ease: "easeInOutQuadd" } as any)).toEqual({
      time: 450,
      ease: "easeInOutSine",
    });
    expect(cameraFollowAnimationOptions(false)).toBeNull();
  });

  it("normalizes continuous follow options", () => {
    expect(cameraFollowOptions({ speed: 12, acceleration: 0.2, radius: 80 })).toEqual({
      speed: 12,
      acceleration: 0.2,
      radius: 80,
    });
    expect(cameraFollowOptions({ speed: -4, acceleration: null, radius: null })).toEqual({
      speed: 0,
      acceleration: null,
      radius: null,
    });
    expect(cameraFollowOptions(true)).toBeUndefined();
  });

  it("animates to the target then follows it", () => {
    const viewport = createViewport();
    const target = { x: 120, y: 240 };

    applyCameraFollow({
      viewport,
      target,
      smoothMove: { time: 800, ease: "easeInOutQuad", speed: 10, radius: 32 },
      followRevision: 2,
      isCurrentRevision: (revision) => revision === 2,
      shouldFollowCamera: () => true,
    });

    expect(viewport.plugins.remove).toHaveBeenCalledWith("animate");
    expect(viewport.plugins.remove).toHaveBeenCalledWith("follow");
    expect(viewport.animate).toHaveBeenCalledWith(
      expect.objectContaining({
        position: { x: 120, y: 240 },
        time: 800,
        ease: "easeInOutQuad",
      })
    );
    expect(viewport.follow).not.toHaveBeenCalled();

    const animateOptions = viewport.animate.mock.calls[0][0];
    animateOptions.callbackOnComplete();

    expect(viewport.follow).toHaveBeenCalledWith(target, {
      speed: 10,
      radius: 32,
    });
  });

  it("follows instantly when smoothMove is disabled", () => {
    const viewport = createViewport();
    const target = { x: 120, y: 240 };

    applyCameraFollow({
      viewport,
      target,
      smoothMove: false,
      followRevision: 1,
      isCurrentRevision: () => true,
      shouldFollowCamera: () => true,
    });

    expect(viewport.animate).not.toHaveBeenCalled();
    expect(viewport.follow).toHaveBeenCalledWith(target);
  });

  it("does not follow after animation if another camera command superseded it", () => {
    const viewport = createViewport();

    applyCameraFollow({
      viewport,
      target: { x: 120, y: 240 },
      smoothMove: { time: 800, ease: "easeInOutQuad" },
      followRevision: 2,
      isCurrentRevision: (revision) => revision === 3,
      shouldFollowCamera: () => true,
    });

    const animateOptions = viewport.animate.mock.calls[0][0];
    animateOptions.callbackOnComplete();

    expect(viewport.follow).not.toHaveBeenCalled();
  });
});
