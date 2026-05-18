export interface ClientPointerPosition {
  x: number;
  y: number;
}

export interface ClientPointerContext {
  screen(): ClientPointerPosition | null;
  world(): ClientPointerPosition | null;
  update(screen: ClientPointerPosition | null, world?: ClientPointerPosition | null): ClientPointerPosition | null;
  updateFromEvent(event: any): ClientPointerPosition | null;
}

function toPosition(point: any): ClientPointerPosition | null {
  const x = Number(point?.x);
  const y = Number(point?.y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return { x, y };
}

function extractGlobalPoint(event: any): ClientPointerPosition | null {
  return toPosition(event?.global)
    ?? toPosition(event?.data?.global)
    ?? toPosition(event);
}

function extractWorldPoint(event: any, global: ClientPointerPosition | null): ClientPointerPosition | null {
  const target = event?.currentTarget ?? event?.target;

  if (target && global && typeof target.toLocal === "function") {
    return toPosition(target.toLocal(global));
  }

  if (typeof event?.getLocalPosition === "function") {
    return toPosition(event.getLocalPosition(target));
  }

  if (typeof event?.data?.getLocalPosition === "function") {
    return toPosition(event.data.getLocalPosition(target));
  }

  return global;
}

export function createClientPointerContext(): ClientPointerContext {
  let lastScreen: ClientPointerPosition | null = null;
  let lastWorld: ClientPointerPosition | null = null;

  const update = (screen: ClientPointerPosition | null, world?: ClientPointerPosition | null) => {
    const nextScreen = toPosition(screen);
    const nextWorld = toPosition(world) ?? nextScreen;

    if (nextScreen) {
      lastScreen = nextScreen;
    }

    if (nextWorld) {
      lastWorld = nextWorld;
    }

    return lastWorld ? { ...lastWorld } : null;
  };

  return {
    screen() {
      return lastScreen ? { ...lastScreen } : null;
    },

    world() {
      return lastWorld ? { ...lastWorld } : null;
    },

    update,

    updateFromEvent(event: any) {
      const global = extractGlobalPoint(event);
      const world = extractWorldPoint(event, global);
      return update(global, world);
    },
  };
}
