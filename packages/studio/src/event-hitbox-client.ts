export type StudioEventHitboxSize = {
  width: number;
  height: number;
};

const DEFAULT_EVENT_HITBOX: StudioEventHitboxSize = {
  width: 32,
  height: 32,
};
const lastStudioConfiguredHitboxes = new WeakMap<object, StudioEventHitboxSize>();

const sameHitbox = (
  first?: StudioEventHitboxSize,
  second?: StudioEventHitboxSize,
): boolean => {
  return first?.width === second?.width && first?.height === second?.height;
};

const normalizeHitbox = (value: unknown): StudioEventHitboxSize | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const width = Number(record.width ?? record.w);
  const height = Number(record.height ?? record.h);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return undefined;
  }
  return {
    width: Math.round(width),
    height: Math.round(height),
  };
};

const canStoreEventState = (event: any): event is object => {
  return (typeof event === "object" && event !== null) || typeof event === "function";
};

const getLastConfiguredHitbox = (event: any): StudioEventHitboxSize | undefined => {
  return canStoreEventState(event)
    ? lastStudioConfiguredHitboxes.get(event)
    : undefined;
};

const rememberConfiguredHitbox = (
  event: any,
  hitbox: StudioEventHitboxSize,
): void => {
  if (canStoreEventState(event)) {
    lastStudioConfiguredHitboxes.set(event, hitbox);
  }
};

export const resolveStudioEventHitboxForSync = (
  event: any,
  configuredHitbox: StudioEventHitboxSize,
): StudioEventHitboxSize => {
  const previousConfigured = getLastConfiguredHitbox(event);
  const currentHitbox = normalizeHitbox(
    typeof event?.hitbox === "function" ? event.hitbox() : event?.hitbox,
  );

  rememberConfiguredHitbox(event, configuredHitbox);

  if (!currentHitbox) {
    return configuredHitbox;
  }

  if (!previousConfigured) {
    return sameHitbox(currentHitbox, DEFAULT_EVENT_HITBOX)
      ? configuredHitbox
      : currentHitbox;
  }

  return sameHitbox(currentHitbox, previousConfigured)
    ? configuredHitbox
    : currentHitbox;
};

export const applyStudioEventHitbox = (
  event: any,
  hitbox: StudioEventHitboxSize,
): void => {
  const current = typeof event?.hitbox === "function" ? event.hitbox() : undefined;
  if (current?.w === hitbox.width && current?.h === hitbox.height) return;

  if (typeof event?.setHitbox === "function") {
    event.setHitbox(hitbox.width, hitbox.height);
  }

  const updated = typeof event?.hitbox === "function" ? event.hitbox() : undefined;
  if (updated?.w === hitbox.width && updated?.h === hitbox.height) return;

  if (typeof event?.hitbox?.set === "function") {
    event.hitbox.set({
      w: hitbox.width,
      h: hitbox.height,
    });
  }
};
