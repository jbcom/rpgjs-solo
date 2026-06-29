export type StudioEventHitboxSize = {
  width: number;
  height: number;
};

const CONFIGURED_HITBOX_KEY = "__rpgjsStudioConfiguredHitbox";
const RUNTIME_HITBOX_KEY = "__rpgjsRuntimeHitbox";

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

const setHiddenHitbox = (
  event: any,
  key: string,
  hitbox: StudioEventHitboxSize,
): void => {
  Object.defineProperty(event, key, {
    value: hitbox,
    configurable: true,
    writable: true,
  });
};

export const resolveStudioEventHitboxForSync = (
  event: any,
  configuredHitbox: StudioEventHitboxSize,
  runtimeOverride?: StudioEventHitboxSize,
): StudioEventHitboxSize => {
  const previousConfigured = normalizeHitbox(event?.[CONFIGURED_HITBOX_KEY]);
  const runtimeHitbox = normalizeHitbox(runtimeOverride) ?? normalizeHitbox(event?.[RUNTIME_HITBOX_KEY]);
  const configuredChanged =
    previousConfigured !== undefined && !sameHitbox(previousConfigured, configuredHitbox);

  setHiddenHitbox(event, CONFIGURED_HITBOX_KEY, configuredHitbox);

  if (configuredChanged) {
    delete event[RUNTIME_HITBOX_KEY];
    return configuredHitbox;
  }

  if (runtimeHitbox) {
    setHiddenHitbox(event, RUNTIME_HITBOX_KEY, runtimeHitbox);
  }

  return runtimeHitbox ?? configuredHitbox;
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
