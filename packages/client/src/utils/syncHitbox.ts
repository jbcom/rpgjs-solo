interface HitboxSize {
  width: number;
  height: number;
}

const toPositiveNumber = (value: unknown): number | null => {
  const numberValue = typeof value === "string" ? Number(value) : value;
  return typeof numberValue === "number" && Number.isFinite(numberValue) && numberValue > 0
    ? Math.round(numberValue)
    : null;
};

const readSignalValue = (value: any): any => {
  if (typeof value === "function") {
    try {
      return value();
    }
    catch {
      return undefined;
    }
  }
  return value;
};

const normalizeHitbox = (source: unknown): HitboxSize | null => {
  if (!source || typeof source !== "object") {
    return null;
  }

  const hitbox = source as any;
  const width = toPositiveNumber(hitbox.w ?? hitbox.width);
  const height = toPositiveNumber(hitbox.h ?? hitbox.height);

  return width && height ? { width, height } : null;
};

const readObjectHitbox = (object: any): HitboxSize | null => {
  return normalizeHitbox(readSignalValue(object?.hitbox));
};

const readCoordinate = (object: any, key: "x" | "y"): number | null => {
  const value = readSignalValue(object?.[key]);
  const numberValue = typeof value === "string" ? Number(value) : value;
  return typeof numberValue === "number" && Number.isFinite(numberValue)
    ? numberValue
    : null;
};

const getObjectById = (sceneMap: any, id: string): any => {
  return sceneMap?.getObjectById?.(id)
    ?? sceneMap?.players?.()?.[id]
    ?? sceneMap?.events?.()?.[id];
};

const applyHitboxToObject = (
  sceneMap: any,
  id: string,
  object: any,
  hitbox: HitboxSize,
): void => {
  if (!object) {
    return;
  }

  const current = readObjectHitbox(object);
  if (current?.width !== hitbox.width || current?.height !== hitbox.height) {
    if (typeof object.hitbox?.set === "function") {
      object.hitbox.set({ w: hitbox.width, h: hitbox.height });
    }
    else if (typeof object.setHitbox === "function") {
      object.setHitbox(hitbox.width, hitbox.height);
      return;
    }
  }

  const objectId = typeof object.id === "string" && object.id ? object.id : id;
  const x = readCoordinate(object, "x");
  const y = readCoordinate(object, "y");
  if (objectId && x !== null && y !== null) {
    sceneMap?.updateHitbox?.(objectId, x, y, hitbox.width, hitbox.height);
  }
};

const applyHitboxCollection = (sceneMap: any, collection: unknown): void => {
  if (!collection || typeof collection !== "object") {
    return;
  }

  for (const [id, patch] of Object.entries(collection)) {
    if (!patch || typeof patch !== "object") {
      continue;
    }
    const hitbox = normalizeHitbox((patch as any).hitbox);
    if (!hitbox) {
      continue;
    }
    applyHitboxToObject(sceneMap, id, getObjectById(sceneMap, id), hitbox);
  }
};

export const applySyncedHitboxPayload = (sceneMap: any, payload: any): void => {
  applyHitboxCollection(sceneMap, payload?.players);
  applyHitboxCollection(sceneMap, payload?.events);
};
