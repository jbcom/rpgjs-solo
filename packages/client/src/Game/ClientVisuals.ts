import type { RpgClientEngine } from "../RpgClientEngine";
import type { RpgClientMap } from "./Map";

export type ClientVisualPosition = {
  x: number;
  y: number;
  z?: number;
};

export type ClientVisualPayload = Record<string, any> & {
  source?: string;
  sourceId?: string;
  target?: string;
  targetId?: string;
  object?: string;
  objectId?: string;
  position?: ClientVisualPosition;
};

export type ClientVisualPacket = {
  name: string;
  data?: ClientVisualPayload;
};

export type ClientVisualObjectTarget = string | Record<string, any> | undefined | null;
export type ClientVisualComponentTarget =
  | ClientVisualObjectTarget
  | ClientVisualPosition;

export type ClientVisualContext = {
  name: string;
  data: ClientVisualPayload;
  engine: RpgClientEngine;
  scene: RpgClientMap;
  source?: any;
  target?: any;
  object?: any;
  position?: ClientVisualPosition;
};

export type ClientVisualHelpers = {
  getObject(id?: string | null): any;
  flash(target?: ClientVisualObjectTarget, options?: Record<string, any>): void;
  showHit(target: ClientVisualObjectTarget, text: string): void;
  component(
    id: string,
    target?: ClientVisualComponentTarget,
    params?: Record<string, any>
  ): void;
  sound(id: string, options?: { volume?: number; loop?: boolean }): Promise<void>;
  animation(
    target: ClientVisualObjectTarget,
    animationName: string,
    options?: { graphic?: string | string[]; repeat?: number }
  ): void;
  shake(options?: {
    intensity?: number;
    duration?: number;
    frequency?: number;
    direction?: string;
  }): void;
};

export type ClientVisualHandler = (
  context: ClientVisualContext,
  helpers: ClientVisualHelpers
) => void | Promise<void>;

export type ClientVisualMap = Record<string, ClientVisualHandler>;

const isPosition = (value: any): value is ClientVisualPosition =>
  value &&
  typeof value === "object" &&
  typeof value.x === "number" &&
  typeof value.y === "number";

const resolvePosition = (data: ClientVisualPayload): ClientVisualPosition | undefined => {
  if (isPosition(data.position)) return data.position;
  if (typeof data.x === "number" && typeof data.y === "number") {
    return { x: data.x, y: data.y, z: data.z };
  }
  return undefined;
};

const resolveObject = (engine: RpgClientEngine, target: ClientVisualObjectTarget) => {
  if (!target) return undefined;
  if (typeof target === "string") return engine.getObjectById(target);
  return target;
};

const resolvePayloadObject = (
  engine: RpgClientEngine,
  data: ClientVisualPayload,
  keys: string[]
) => {
  const id = keys
    .map((key) => data[key])
    .find((value) => typeof value === "string");
  return resolveObject(engine, id);
};

const createClientVisualHelpers = (
  engine: RpgClientEngine
): ClientVisualHelpers => ({
  getObject(id) {
    if (!id) return undefined;
    return engine.getObjectById(id);
  },
  flash(target, options = {}) {
    const object = resolveObject(engine, target);
    object?.flash?.(options);
  },
  showHit(target, text) {
    const object = resolveObject(engine, target);
    object?.showHit?.(text);
  },
  component(id, target, params = {}) {
    const object = isPosition(target) ? undefined : resolveObject(engine, target);
    const position = isPosition(target) ? target : undefined;
    const anchor = object ?? position;
    if (!anchor) return;
    engine.getComponentAnimation(id).displayEffect(params, anchor);
  },
  sound(id, options) {
    return engine.playSound(id, options);
  },
  animation(target, animationName, options = {}) {
    const object = resolveObject(engine, target);
    if (!object?.setAnimation) return;
    if (options.graphic !== undefined) {
      object.setAnimation(animationName, options.graphic, options.repeat ?? 1);
      return;
    }
    object.setAnimation(animationName, options.repeat ?? 1);
  },
  shake(options = {}) {
    engine.mapShakeTrigger.start(options);
  },
});

export class ClientVisualRegistry {
  private readonly handlers = new Map<string, ClientVisualHandler>();

  register(name: string, handler: ClientVisualHandler) {
    this.handlers.set(name, handler);
    return handler;
  }

  registerMany(visuals: ClientVisualMap) {
    Object.entries(visuals).forEach(([name, handler]) => {
      this.register(name, handler);
    });
  }

  get(name: string) {
    return this.handlers.get(name);
  }

  async play(packet: ClientVisualPacket, engine: RpgClientEngine) {
    const handler = this.handlers.get(packet.name);
    if (!handler) {
      console.warn(`Client visual "${packet.name}" is not registered`);
      return;
    }

    const data = packet.data ?? {};
    const context: ClientVisualContext = {
      name: packet.name,
      data,
      engine,
      scene: engine.scene,
      source: resolvePayloadObject(engine, data, ["sourceId", "source"]),
      target: resolvePayloadObject(engine, data, ["targetId", "target"]),
      object: resolvePayloadObject(engine, data, ["objectId", "object"]),
      position: resolvePosition(data),
    };

    try {
      await handler(context, createClientVisualHelpers(engine));
    } catch (error) {
      console.error(`Client visual "${packet.name}" failed`, error);
    }
  }
}
