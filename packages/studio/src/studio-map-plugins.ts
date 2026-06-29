import type { RpgClientEngine } from "@rpgjs/client";
import { Container, Graphics, Text } from "pixi.js";
import type { StudioElementRenderOptions } from "./map-renderer/studio-element-renderer";

export interface StudioMapPluginContext {
  engine: RpgClientEngine<any>;
  map: any;
  data: any;
}

export type StudioTerrainRenderOptions = {
  debugCollisions?: boolean;
};

export type StudioMapPluginPixiChild = any & {
  __studioMapPluginUpdate?: () => void;
};

export interface StudioMapPlugin {
  id: string;
  terrainOptions?: (ctx: StudioMapPluginContext) => StudioTerrainRenderOptions;
  elementRenderOptions?: (ctx: StudioMapPluginContext) => Partial<StudioElementRenderOptions>;
  eventLayerPixiChildren?: (ctx: StudioMapPluginContext) => StudioMapPluginPixiChild[];
}

export interface StudioDebugCollisionsOptions {
  terrain?: boolean;
  elements?: boolean;
  events?: boolean;
  players?: boolean;
  color?: number;
  fillAlpha?: number;
  strokeAlpha?: number;
}

export interface CreateStudioMapPluginsOptions {
  plugins?: StudioMapPlugin[];
  debugCollisions?: boolean;
}

export interface StudioEventCollisionDebugRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

const DEBUG_COLLISIONS_PLUGIN_ID = "studio.debug-collisions";

const readValue = (value: any) => typeof value === "function" ? value() : value;

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const readSignalNumber = (value: any, fallback = 0): number => {
  return toFiniteNumber(readValue(value), fallback);
};

function readHitboxSize(value: any): { width: number; height: number } | null {
  const hitbox = readValue(value);
  const width = toFiniteNumber(hitbox?.w ?? hitbox?.width, 0);
  const height = toFiniteNumber(hitbox?.h ?? hitbox?.height, 0);
  if (width <= 0 || height <= 0) return null;
  return {
    width,
    height,
  };
}

function getEventBodyPosition(engine: RpgClientEngine<any>, id: string, event: any): { x: number; y: number } {
  const sceneMap = (engine as any).sceneMap;
  const topLeft = sceneMap?.getBodyPosition?.(id, "top-left");
  if (topLeft && Number.isFinite(Number(topLeft.x)) && Number.isFinite(Number(topLeft.y))) {
    return {
      x: Number(topLeft.x),
      y: Number(topLeft.y),
    };
  }
  return {
    x: readSignalNumber(event?.x),
    y: readSignalNumber(event?.y),
  };
}

function getEventBodySize(engine: RpgClientEngine<any>, id: string): { width: number; height: number } | null {
  const body = (engine as any).sceneMap?.getBody?.(id);
  const width = toFiniteNumber(body?.width ?? (body?.radius ? body.radius * 2 : undefined), 0);
  const height = toFiniteNumber(body?.height ?? (body?.radius ? body.radius * 2 : undefined), 0);
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

function resolveStudioEventCollisionDebugRect(
  engine: RpgClientEngine<any>,
  id: string,
  event: any,
): StudioEventCollisionDebugRect | null {
  const hitbox = getEventBodySize(engine, id)
    ?? readHitboxSize(event?.hitbox)
    ?? readHitboxSize(event?.params?.hitbox)
    ?? readHitboxSize(event?.eventId?.hitbox);
  if (!hitbox) return null;

  const position = getEventBodyPosition(engine, id, event);
  const width = Math.round(hitbox.width);
  const height = Math.round(hitbox.height);
  return {
    id,
    x: Math.round(position.x),
    y: Math.round(position.y),
    width,
    height,
    label: `${width} x ${height}`,
  };
}

export function resolveStudioEventCollisionDebugRects(
  engine: RpgClientEngine<any>,
  options: StudioDebugCollisionsOptions = {},
): StudioEventCollisionDebugRect[] {
  const sceneMap = (engine as any).sceneMap;
  const includePlayers = options.players !== false;
  const entries = Object.entries(readValue(sceneMap?.events) || {});
  const playerEntries = includePlayers ? Object.entries(readValue(sceneMap?.players) || {}) : [];

  return [...entries, ...playerEntries]
    .map(([id, event]) => resolveStudioEventCollisionDebugRect(engine, id, event))
    .filter((rect): rect is StudioEventCollisionDebugRect => rect !== null);
}

export function createStudioEventCollisionDebugOverlay(
  engine: RpgClientEngine<any>,
  options: StudioDebugCollisionsOptions = {},
): StudioMapPluginPixiChild {
  const container = new Container() as StudioMapPluginPixiChild;
  const graphics = new Graphics();
  const labels = new Map<string, Text>();
  const color = options.color ?? 0xef4444;
  const fillAlpha = options.fillAlpha ?? 0.18;
  const strokeAlpha = options.strokeAlpha ?? 0.72;

  container.zIndex = 2147483647;
  container.label = "StudioEventCollisionDebug";
  container.addChild(graphics);
  container.__studioMapPluginUpdate = () => {
    if (container.destroyed) return;
    graphics.clear();
    const activeLabels = new Set<string>();
    resolveStudioEventCollisionDebugRects(engine, options).forEach((rect) => {
      const labelHeight = 15;
      const labelPadding = 4;
      const labelX = rect.x;
      const labelY = rect.y - labelHeight - 4;
      const labelWidth = Math.max(44, rect.label.length * 7 + labelPadding * 2);

      graphics
        .rect(rect.x, rect.y, rect.width, rect.height)
        .fill({ color, alpha: fillAlpha })
        .stroke({ width: 1, color, alpha: strokeAlpha })
        .rect(labelX, labelY, labelWidth, labelHeight)
        .fill({ color: 0x7f1d1d, alpha: 0.88 });

      const labelKey = rect.id;
      activeLabels.add(labelKey);
      let label = labels.get(labelKey);
      if (!label || label.destroyed) {
        label = new Text({
          text: rect.label,
          style: {
            fill: 0xffffff,
            fontFamily: "Arial",
            fontSize: 11,
            fontWeight: "600",
          },
        });
        labels.set(labelKey, label);
        container.addChild(label);
      }
      label.text = rect.label;
      label.x = labelX + labelPadding;
      label.y = labelY + 1;
    });
    for (const [labelKey, label] of labels) {
      if (activeLabels.has(labelKey)) continue;
      labels.delete(labelKey);
      label.destroy();
    }
  };

  container.__studioMapPluginUpdate();
  return container;
}

export function studioDebugCollisionsPlugin(options: StudioDebugCollisionsOptions = {}): StudioMapPlugin {
  let eventOverlay: StudioMapPluginPixiChild | null = null;

  return {
    id: DEBUG_COLLISIONS_PLUGIN_ID,
    terrainOptions() {
      return {
        debugCollisions: options.terrain !== false,
      };
    },
    elementRenderOptions() {
      return {
        debugCollisions: options.elements !== false,
      };
    },
    eventLayerPixiChildren(ctx) {
      if (options.events === false) return [];
      if (!eventOverlay || eventOverlay.destroyed) {
        eventOverlay = createStudioEventCollisionDebugOverlay(ctx.engine, options);
      }
      return [eventOverlay];
    },
  };
}

export function createStudioMapPlugins(options: CreateStudioMapPluginsOptions = {}): StudioMapPlugin[] {
  const plugins = [...(options.plugins ?? [])];
  if (options.debugCollisions === true && !plugins.some((plugin) => plugin.id === DEBUG_COLLISIONS_PLUGIN_ID)) {
    plugins.unshift(studioDebugCollisionsPlugin());
  }
  return plugins;
}

export function composeStudioMapPluginOptions<T extends Record<string, any>>(
  plugins: StudioMapPlugin[],
  hookName: "terrainOptions" | "elementRenderOptions",
  ctx: StudioMapPluginContext,
): T {
  return plugins.reduce((options, plugin) => {
    const hook = plugin[hookName];
    if (!hook) return options;
    return {
      ...options,
      ...hook(ctx),
    };
  }, {} as T);
}

export function collectStudioMapPluginPixiChildren(
  plugins: StudioMapPlugin[],
  ctx: StudioMapPluginContext,
): StudioMapPluginPixiChild[] {
  return plugins.flatMap((plugin) => plugin.eventLayerPixiChildren?.(ctx) ?? []).filter(Boolean);
}
