export const DEFAULT_CAMERA_FOLLOW_TIME = 1000;
export const DEFAULT_CAMERA_FOLLOW_EASE = "easeInOutSine";

export const CAMERA_FOLLOW_EASES = [
  "linear",
  "easeInQuad",
  "easeOutQuad",
  "easeInOutQuad",
  "easeInCubic",
  "easeOutCubic",
  "easeInOutCubic",
  "easeInQuart",
  "easeOutQuart",
  "easeInOutQuart",
  "easeInQuint",
  "easeOutQuint",
  "easeInOutQuint",
  "easeInSine",
  "easeOutSine",
  "easeInOutSine",
  "easeInExpo",
  "easeOutExpo",
  "easeInOutExpo",
  "easeInCirc",
  "easeOutCirc",
  "easeInOutCirc",
  "easeInElastic",
  "easeOutElastic",
  "easeInOutElastic",
  "easeInBack",
  "easeOutBack",
  "easeInOutBack",
  "easeInBounce",
  "easeOutBounce",
  "easeInOutBounce",
] as const;

export type CameraFollowEase = typeof CAMERA_FOLLOW_EASES[number];

export type CameraFollowSmoothMoveOptions = {
  /** Enable or disable the smooth transition when options are sent as an object. */
  enabled?: boolean;
  /** Duration of the transition to the new camera target, in milliseconds. */
  time?: number;
  /** pixi-viewport easing name, for example "easeInOutQuad". */
  ease?: CameraFollowEase;
  /** Continuous follow speed after the transition. 0 keeps the target centered instantly. */
  speed?: number;
  /** Continuous follow acceleration after the transition. */
  acceleration?: number | null;
  /** Center radius where the followed target can move without moving the viewport. */
  radius?: number | null;
};

export type CameraFollowSmoothMove = boolean | CameraFollowSmoothMoveOptions;

export interface CameraFollowApplyContext {
  viewport: any;
  target: { x: number; y: number };
  smoothMove: CameraFollowSmoothMove;
  followRevision: number;
  isCurrentRevision: (revision: number) => boolean;
  shouldFollowCamera: () => boolean;
}

const finiteNumber = (value: unknown, fallback: number) => {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

const isCameraFollowEase = (value: unknown): value is CameraFollowEase => {
  return typeof value === "string" && (CAMERA_FOLLOW_EASES as readonly string[]).includes(value);
};

export const smoothMoveEnabled = (smoothMove: CameraFollowSmoothMove) => {
  if (smoothMove === false) return false;
  if (typeof smoothMove === "object" && smoothMove !== null && smoothMove.enabled === false) {
    return false;
  }
  return true;
};

export const cameraFollowAnimationOptions = (
  smoothMove: CameraFollowSmoothMove
) => {
  if (!smoothMoveEnabled(smoothMove)) return null;
  const options = typeof smoothMove === "object" && smoothMove !== null ? smoothMove : {};
  return {
    time: Math.max(0, finiteNumber(options.time, DEFAULT_CAMERA_FOLLOW_TIME)),
    ease: isCameraFollowEase(options.ease) ? options.ease : DEFAULT_CAMERA_FOLLOW_EASE,
  };
};

export const cameraFollowOptions = (smoothMove: CameraFollowSmoothMove) => {
  if (typeof smoothMove !== "object" || smoothMove === null) return undefined;
  const options: { speed?: number; acceleration?: number | null; radius?: number | null } = {};
  if (typeof smoothMove.speed === "number" && Number.isFinite(smoothMove.speed)) {
    options.speed = Math.max(0, smoothMove.speed);
  }
  if (typeof smoothMove.acceleration === "number" && Number.isFinite(smoothMove.acceleration)) {
    options.acceleration = Math.max(0, smoothMove.acceleration);
  } else if (smoothMove.acceleration === null) {
    options.acceleration = null;
  }
  if (typeof smoothMove.radius === "number" && Number.isFinite(smoothMove.radius)) {
    options.radius = Math.max(0, smoothMove.radius);
  } else if (smoothMove.radius === null) {
    options.radius = null;
  }
  return Object.keys(options).length > 0 ? options : undefined;
};

export const clearCameraFollowPlugins = (viewport: any) => {
  viewport?.plugins?.remove?.("animate");
  viewport?.plugins?.remove?.("follow");
};

export const followCameraInstantly = (
  viewport: any,
  target: { x: number; y: number },
  smoothMove: CameraFollowSmoothMove
) => {
  const followOptions = cameraFollowOptions(smoothMove);
  if (followOptions) {
    viewport.follow(target, followOptions);
  } else {
    viewport.follow(target);
  }
};

export const applyCameraFollow = ({
  viewport,
  target,
  smoothMove,
  followRevision,
  isCurrentRevision,
  shouldFollowCamera,
}: CameraFollowApplyContext) => {
  clearCameraFollowPlugins(viewport);

  const animationOptions = cameraFollowAnimationOptions(smoothMove);
  if (!animationOptions || animationOptions.time <= 0) {
    followCameraInstantly(viewport, target, smoothMove);
    return;
  }

  viewport.animate({
    position: { x: target.x, y: target.y },
    time: animationOptions.time,
    ease: animationOptions.ease,
    callbackOnComplete: () => {
      if (!isCurrentRevision(followRevision) || !shouldFollowCamera()) return;
      followCameraInstantly(viewport, target, smoothMove);
    },
  });
};
