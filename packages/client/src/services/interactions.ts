import { signal } from "canvasengine";
import type { RpgActionInput, RpgActionName } from "@rpgjs/common";
import type { RpgClientEngine } from "../RpgClientEngine";

export type RpgInteractionEventName =
  | "pointerenter"
  | "pointerleave"
  | "pointerover"
  | "pointerout"
  | "pointerdown"
  | "pointerup"
  | "pointermove"
  | "click"
  | "dragstart"
  | "dragmove"
  | "drop"
  | "cancel";

export type RpgInteractionPosition = {
  x: number;
  y: number;
};

export type RpgInteractionBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  contains(point: RpgInteractionPosition | null | undefined): boolean;
};

export type RpgInteractionBoundsSet = {
  bounds?: RpgInteractionBounds;
  hitbox?: RpgInteractionBounds;
  graphic?: RpgInteractionBounds;
  [key: string]: RpgInteractionBounds | undefined;
};

export type RpgInteractionTile = {
  x: number;
  y: number;
  worldX: number;
  worldY: number;
  width: number;
  height: number;
};

export type RpgInteractionState = {
  hovered: boolean;
  pressed: boolean;
  selected: boolean;
  dragging: boolean;
  data: Record<string, any>;
  overlays: Record<string, RpgInteractionOverlay>;
};

export type RpgInteractionOverlay = {
  component: any;
  props?: Record<string, any>;
};

export type RpgInteractionMatcher =
  | string
  | ((ctx: RpgInteractionMatcherContext) => boolean);

export type RpgInteractionMatcherContext = {
  client: RpgClientEngine;
  target: any;
  sprite: any;
};

export type RpgInteractionHandler = (ctx: RpgInteractionContext) => void;

export type RpgInteractionBehavior = {
  component?: any;
  props?: Record<string, any> | ((ctx: RpgInteractionContext) => Record<string, any>);
  dependencies?: any[] | ((ctx: RpgInteractionContext) => any[]);
  cursor?: string | ((ctx: RpgInteractionContext) => string | undefined);
  hitTest?: (ctx: RpgInteractionContext) => boolean;
  pointerenter?: RpgInteractionHandler;
  pointerleave?: RpgInteractionHandler;
  pointerover?: RpgInteractionHandler;
  pointerout?: RpgInteractionHandler;
  pointerdown?: RpgInteractionHandler;
  pointerup?: RpgInteractionHandler;
  pointermove?: RpgInteractionHandler;
  click?: RpgInteractionHandler;
  dragstart?: RpgInteractionHandler;
  dragmove?: RpgInteractionHandler;
  drop?: RpgInteractionHandler;
  cancel?: RpgInteractionHandler;
};

export type RpgInteractionComponentEntry = {
  component: any;
  props: Record<string, any>;
  dependencies: any[];
};

export type RpgInteractionContext = {
  client: RpgClientEngine;
  target: any;
  sprite: any;
  event?: any;
  behavior: RpgInteractionBehavior;
  behaviorId: string;
  pointer: {
    screen(): RpgInteractionPosition | null;
    world(): RpgInteractionPosition | null;
    tile(): RpgInteractionTile | null;
  };
  bounds(kind?: string): RpgInteractionBounds;
  state: {
    value(): RpgInteractionState;
    get<T = any>(key: string): T | undefined;
    set(key: string, value: any): void;
    patch(patch: Partial<Omit<RpgInteractionState, "data" | "overlays">>): void;
  };
  overlay: {
    render(component: any, props?: Record<string, any>): void;
    update(props?: Record<string, any>): void;
    clear(): void;
  };
  select(selected?: boolean): void;
  action(action: RpgActionName, data?: any): void;
  action(input: RpgActionInput): void;
  cancel(): void;
};

type InteractionRegistration = {
  id: string;
  matcher: RpgInteractionMatcher;
  behavior: RpgInteractionBehavior;
};

type InteractionEventInput = {
  event?: any;
  bounds?: RpgInteractionBoundsSet;
};

type ActiveDrag = {
  sprite: any;
  behavior: RpgInteractionBehavior;
  behaviorId: string;
  bounds?: RpgInteractionBoundsSet;
  cancelled: boolean;
};

const DEFAULT_STATE: RpgInteractionState = {
  hovered: false,
  pressed: false,
  selected: false,
  dragging: false,
  data: {},
  overlays: {},
};

function readValue(value: any): any {
  return typeof value === "function" ? value() : value;
}

function createBounds(value: any): RpgInteractionBounds {
  const left = Number(value?.left ?? value?.x ?? 0);
  const top = Number(value?.top ?? value?.y ?? 0);
  const width = Number(value?.width ?? value?.w ?? 0);
  const height = Number(value?.height ?? value?.h ?? 0);
  const right = Number(value?.right ?? left + width);
  const bottom = Number(value?.bottom ?? top + height);
  const resolvedWidth = Number.isFinite(width) && width > 0 ? width : Math.max(0, right - left);
  const resolvedHeight = Number.isFinite(height) && height > 0 ? height : Math.max(0, bottom - top);

  return {
    left,
    top,
    right,
    bottom,
    width: resolvedWidth,
    height: resolvedHeight,
    centerX: Number(value?.centerX ?? left + resolvedWidth / 2),
    centerY: Number(value?.centerY ?? top + resolvedHeight / 2),
    contains(point) {
      if (!point) return false;
      return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
    },
  };
}

function normalizeBounds(bounds?: RpgInteractionBoundsSet): RpgInteractionBoundsSet {
  if (!bounds) return {};

  return Object.entries(bounds).reduce<RpgInteractionBoundsSet>((next, [key, value]) => {
    if (value) next[key] = createBounds(value);
    return next;
  }, {});
}

function normalizeBehavior(behavior: RpgInteractionBehavior | any): RpgInteractionBehavior {
  if (typeof behavior === "function") {
    return { component: behavior };
  }
  return behavior ?? {};
}

export class RpgClientInteractions {
  private registrations = signal<InteractionRegistration[]>([]);
  private states = signal<Record<string, RpgInteractionState>>({});
  private activeDrag?: ActiveDrag;
  private nextId = 0;

  constructor(private client: RpgClientEngine) {}

  use(matcher: RpgInteractionMatcher, behavior: RpgInteractionBehavior | any): () => void {
    const registration = {
      id: `interaction:${++this.nextId}`,
      matcher,
      behavior: normalizeBehavior(behavior),
    };

    this.registrations.update((registrations) => [...registrations, registration]);

    return () => {
      this.registrations.update((registrations) =>
        registrations.filter((entry) => entry.id !== registration.id)
      );
    };
  }

  getState(sprite: any): RpgInteractionState {
    const id = this.getSpriteId(sprite);
    return {
      ...DEFAULT_STATE,
      ...(id ? this.states()[id] : undefined),
      data: id ? { ...(this.states()[id]?.data ?? {}) } : {},
      overlays: id ? { ...(this.states()[id]?.overlays ?? {}) } : {},
    };
  }

  getRenderedComponents(sprite: any, bounds?: RpgInteractionBoundsSet): RpgInteractionComponentEntry[] {
    const normalizedBounds = normalizeBounds(bounds);
    const matched = this.getMatches(sprite);
    const state = this.getState(sprite);
    const entries: RpgInteractionComponentEntry[] = [];

    matched.forEach((registration) => {
      if (!registration.behavior.component) return;
      const ctx = this.createContext(sprite, registration, { bounds: normalizedBounds });
      entries.push({
        component: registration.behavior.component,
        props: {
          ...this.defaultComponentProps(sprite, state, normalizedBounds),
          ...this.resolveProps(registration.behavior.props, ctx),
        },
        dependencies: this.resolveDependencies(registration.behavior.dependencies, ctx),
      });
    });

    Object.entries(state.overlays).forEach(([id, overlay]) => {
      entries.push({
        component: overlay.component,
        props: {
          ...this.defaultComponentProps(sprite, state, normalizedBounds),
          ...(overlay.props ?? {}),
          overlayId: id,
        },
        dependencies: [],
      });
    });

    return entries;
  }

  cursorFor(sprite: any, bounds?: RpgInteractionBoundsSet): string | undefined {
    for (const registration of this.getMatches(sprite)) {
      const cursor = registration.behavior.cursor;
      if (!cursor) continue;
      const ctx = this.createContext(sprite, registration, { bounds: normalizeBounds(bounds) });
      if (!this.passesHitTest(registration.behavior, ctx, "pointermove")) continue;
      const resolved = typeof cursor === "function" ? cursor(ctx) : cursor;
      if (resolved) return resolved;
    }
    return undefined;
  }

  handle(sprite: any, type: RpgInteractionEventName, input: InteractionEventInput = {}): void {
    const matches = this.getMatches(sprite);
    const bounds = normalizeBounds(input.bounds);
    const entries = matches
      .map((registration) => ({
        registration,
        ctx: this.createContext(sprite, registration, {
          event: input.event,
          bounds,
        }),
      }))
      .filter(({ registration, ctx }) =>
        this.passesHitTest(registration.behavior, ctx, type)
      );

    if (type === "pointerover" || type === "pointerenter") {
      if (entries.length > 0) {
        this.patchState(sprite, { hovered: true });
      }
    }
    if (type === "pointerout" || type === "pointerleave") {
      if (matches.length > 0) {
        this.patchState(sprite, { hovered: false, pressed: false });
      }
    }
    if (type === "pointerdown") {
      if (entries.length > 0) {
        this.patchState(sprite, { pressed: true });
      }
    }
    if (type === "pointerup") {
      if (matches.length > 0) {
        this.patchState(sprite, { pressed: false });
      }
    }

    entries.forEach(({ registration, ctx }) => {
      this.callHandler(registration.behavior, type, ctx);

      if (type === "pointerdown" && this.isDraggable(registration.behavior)) {
        this.activeDrag = {
          sprite,
          behavior: registration.behavior,
          behaviorId: registration.id,
          bounds,
          cancelled: false,
        };
        this.patchState(sprite, { dragging: true });
        this.callHandler(registration.behavior, "dragstart", ctx);
      }
    });
  }

  handlePointerMove(event?: any): void {
    if (!this.activeDrag) return;
    const drag = this.activeDrag;
    const registration = {
      id: drag.behaviorId,
      matcher: "*",
      behavior: drag.behavior,
    };
    const ctx = this.createContext(drag.sprite, registration, {
      event,
      bounds: drag.bounds,
    });
    this.callHandler(drag.behavior, "dragmove", ctx);
  }

  handlePointerUp(event?: any): void {
    if (!this.activeDrag) return;
    const drag = this.activeDrag;
    this.activeDrag = undefined;
    this.patchState(drag.sprite, { dragging: false, pressed: false });

    const registration = {
      id: drag.behaviorId,
      matcher: "*",
      behavior: drag.behavior,
    };
    const ctx = this.createContext(drag.sprite, registration, {
      event,
      bounds: drag.bounds,
    });

    this.callHandler(drag.behavior, drag.cancelled ? "cancel" : "drop", ctx);
  }

  cancelDrag(event?: any): void {
    if (!this.activeDrag) return;
    this.activeDrag.cancelled = true;
    this.handlePointerUp(event);
  }

  private getMatches(sprite: any): InteractionRegistration[] {
    return this.registrations().filter((registration) =>
      this.matches(registration.matcher, sprite)
    );
  }

  private matches(matcher: RpgInteractionMatcher, sprite: any): boolean {
    if (typeof matcher === "function") {
      return !!matcher({ client: this.client, target: sprite, sprite });
    }

    if (matcher === "*") return true;

    const candidates = [
      readValue(sprite?.id),
      readValue(sprite?.name),
      readValue(sprite?._name),
      readValue(sprite?.type),
      readValue(sprite?._type),
      sprite?.constructor?.name,
    ].filter(Boolean);

    return candidates.includes(matcher);
  }

  private createContext(
    sprite: any,
    registration: Pick<InteractionRegistration, "id" | "behavior">,
    input: InteractionEventInput = {},
  ): RpgInteractionContext {
    const bounds = normalizeBounds(input.bounds);

    const ctx = {
      client: this.client,
      target: sprite,
      sprite,
      event: input.event,
      behavior: registration.behavior,
      behaviorId: registration.id,
      pointer: {
        screen: () => this.client.pointer.screen(),
        world: () => this.client.pointer.world(),
        tile: () => this.getPointerTile(),
      },
      bounds: (kind = "bounds") =>
        bounds[kind] ?? bounds.graphic ?? bounds.hitbox ?? bounds.bounds ?? createBounds({}),
      state: {
        value: () => this.getState(sprite),
        get: <T = any>(key: string) => this.getState(sprite).data[key] as T | undefined,
        set: (key: string, value: any) => this.patchStateData(sprite, { [key]: value }),
        patch: (patch: Partial<Omit<RpgInteractionState, "data" | "overlays">>) =>
          this.patchState(sprite, patch),
      },
      overlay: {
        render: (component: any, props?: Record<string, any>) =>
          this.patchOverlay(sprite, registration.id, { component, props }),
        update: (props?: Record<string, any>) =>
          this.updateOverlay(sprite, registration.id, props),
        clear: () => this.clearOverlay(sprite, registration.id),
      },
      select: (selected = true) => this.patchState(sprite, { selected }),
      action: (action: RpgActionName | RpgActionInput, data?: any) =>
        this.client.processAction(action as any, data),
      cancel: () => {
        const activeDrag = this.activeDrag;
        if (activeDrag && activeDrag.sprite === sprite) {
          activeDrag.cancelled = true;
        }
      },
    };

    return ctx;
  }

  private callHandler(
    behavior: RpgInteractionBehavior,
    type: RpgInteractionEventName,
    ctx: RpgInteractionContext,
  ): void {
    const handler = behavior[type];
    handler?.(ctx);

    if (type === "pointerover") {
      behavior.pointerenter?.(ctx);
    }
    if (type === "pointerout") {
      behavior.pointerleave?.(ctx);
    }
  }

  private passesHitTest(
    behavior: RpgInteractionBehavior,
    ctx: RpgInteractionContext,
    type: RpgInteractionEventName,
  ): boolean {
    if (!behavior.hitTest) return true;
    if (type === "pointerout" || type === "pointerleave" || type === "cancel" || type === "drop") {
      return true;
    }
    return behavior.hitTest(ctx);
  }

  private isDraggable(behavior: RpgInteractionBehavior): boolean {
    return !!(behavior.dragstart || behavior.dragmove || behavior.drop || behavior.cancel);
  }

  private defaultComponentProps(
    sprite: any,
    state: RpgInteractionState,
    bounds: RpgInteractionBoundsSet,
  ): Record<string, any> {
    return {
      target: sprite,
      sprite,
      state,
      bounds: bounds.bounds ?? bounds.graphic ?? bounds.hitbox ?? createBounds({}),
      hitboxBounds: bounds.hitbox,
      graphicBounds: bounds.graphic,
      pointer: this.client.pointer,
      client: this.client,
    };
  }

  private resolveProps(
    props: RpgInteractionBehavior["props"],
    ctx: RpgInteractionContext,
  ): Record<string, any> {
    if (!props) return {};
    return typeof props === "function" ? props(ctx) : props;
  }

  private resolveDependencies(
    dependencies: RpgInteractionBehavior["dependencies"],
    ctx: RpgInteractionContext,
  ): any[] {
    if (!dependencies) return [];
    return typeof dependencies === "function" ? dependencies(ctx) : dependencies;
  }

  private getSpriteId(sprite: any): string | undefined {
    const id = readValue(sprite?.id);
    return id == null ? undefined : String(id);
  }

  private patchState(
    sprite: any,
    patch: Partial<Omit<RpgInteractionState, "data" | "overlays">>,
  ): void {
    const id = this.getSpriteId(sprite);
    if (!id) return;
    this.states.update((states) => ({
      ...states,
      [id]: {
        ...DEFAULT_STATE,
        ...(states[id] ?? {}),
        ...patch,
        data: states[id]?.data ?? {},
        overlays: states[id]?.overlays ?? {},
      },
    }));
  }

  private patchStateData(sprite: any, patch: Record<string, any>): void {
    const id = this.getSpriteId(sprite);
    if (!id) return;
    const current = this.getState(sprite);
    this.states.update((states) => ({
      ...states,
      [id]: {
        ...current,
        data: {
          ...current.data,
          ...patch,
        },
      },
    }));
  }

  private patchOverlay(sprite: any, id: string, overlay: RpgInteractionOverlay): void {
    const spriteId = this.getSpriteId(sprite);
    if (!spriteId) return;
    const current = this.getState(sprite);
    this.states.update((states) => ({
      ...states,
      [spriteId]: {
        ...current,
        overlays: {
          ...current.overlays,
          [id]: overlay,
        },
      },
    }));
  }

  private updateOverlay(sprite: any, id: string, props?: Record<string, any>): void {
    const current = this.getState(sprite);
    const overlay = current.overlays[id];
    if (!overlay) return;
    this.patchOverlay(sprite, id, {
      ...overlay,
      props: {
        ...(overlay.props ?? {}),
        ...(props ?? {}),
      },
    });
  }

  private clearOverlay(sprite: any, id: string): void {
    const spriteId = this.getSpriteId(sprite);
    if (!spriteId) return;
    const current = this.getState(sprite);
    const { [id]: _removed, ...overlays } = current.overlays;
    this.states.update((states) => ({
      ...states,
      [spriteId]: {
        ...current,
        overlays,
      },
    }));
  }

  private getPointerTile(): RpgInteractionTile | null {
    const world = this.client.pointer.world();
    if (!world) return null;

    const map = (this.client as any).sceneMap;
    const width = Number(map?.tileWidth ?? 32);
    const height = Number(map?.tileHeight ?? 32);
    const tileX = Math.floor(world.x / width);
    const tileY = Math.floor(world.y / height);

    return {
      x: tileX,
      y: tileY,
      worldX: tileX * width,
      worldY: tileY * height,
      width,
      height,
    };
  }
}

export function hoverPopover(component: any, props?: Record<string, any>): RpgInteractionBehavior {
  return {
    component,
    props,
    cursor: "pointer",
  };
}

export function selectable(options: {
  cursor?: string;
  onSelect?: RpgInteractionHandler;
} = {}): RpgInteractionBehavior {
  return {
    cursor: options.cursor ?? "pointer",
    click(ctx) {
      ctx.select();
      options.onSelect?.(ctx);
    },
  };
}

export function draggable(options: {
  cursor?: string;
  start?: RpgInteractionHandler;
  move?: RpgInteractionHandler;
  drop?: RpgInteractionHandler;
  cancel?: RpgInteractionHandler;
} = {}): RpgInteractionBehavior {
  return {
    cursor: options.cursor ?? "grab",
    dragstart(ctx) {
      ctx.state.patch({ dragging: true });
      options.start?.(ctx);
    },
    dragmove: options.move,
    drop(ctx) {
      ctx.state.patch({ dragging: false, pressed: false });
      options.drop?.(ctx);
    },
    cancel(ctx) {
      ctx.state.patch({ dragging: false, pressed: false });
      options.cancel?.(ctx);
    },
  };
}

export function dragToTile(options: {
  action?: RpgActionName;
  data?: (ctx: RpgInteractionContext) => any;
  onDrop?: RpgInteractionHandler;
  cursor?: string;
}): RpgInteractionBehavior {
  return draggable({
    cursor: options.cursor,
    drop(ctx) {
      if (options.onDrop) {
        options.onDrop(ctx);
        return;
      }
      if (!options.action) return;
      ctx.action(options.action, options.data ? options.data(ctx) : {
        eventId: ctx.target.id,
        position: ctx.pointer.tile(),
      });
    },
  });
}
