import { computed, Signal } from "canvasengine";
import { RpgClientObject } from "../Game/Object";
import { readPropValue } from "./readPropValue";

const BUILTIN_PARAM_KEYS = [
  "maxHp",
  "maxSp",
  "atk",
  "pdef",
  "sdef",
  "str",
  "agi",
  "int",
  "dex",
] as const;

type BuiltInParamKey = typeof BUILTIN_PARAM_KEYS[number];
type ParamPropKey = `params.${BuiltInParamKey}` | `params.${string}`;

const entityPropMap = {
  level: (entity: RpgClientObject) => entity._level(),
  exp: (entity: RpgClientObject) => entity._exp(),
  gold: (entity: RpgClientObject) => entity._gold(),
  hp: (entity: RpgClientObject) => entity.hpSignal(),
  sp: (entity: RpgClientObject) => entity.spSignal(),
  name: (entity: RpgClientObject) => entity.name,
  type: (entity: RpgClientObject) => entity.type(),
  x: (entity: RpgClientObject) => entity.x(),
  y: (entity: RpgClientObject) => entity.y(),
  z: (entity: RpgClientObject) => entity.z(),
  tint: (entity: RpgClientObject) => entity.tint(),
  direction: (entity: RpgClientObject) => entity.direction(),
  speed: (entity: RpgClientObject) => entity.speed,
  hitbox: (entity: RpgClientObject) => entity.hitbox(),
  animation: (entity: RpgClientObject) => entity.animationName(),
  canMove: (entity: RpgClientObject) => readPropValue<boolean>((entity as any)._canMove ?? entity.canMove),
  graphics: (entity: RpgClientObject) => entity.graphics(),
  items: (entity: RpgClientObject) => entity.items(),
  equipments: (entity: RpgClientObject) => entity.equipments(),
  states: (entity: RpgClientObject) => entity.states(),
  skills: (entity: RpgClientObject) => entity.skills(),
  effects: (entity: RpgClientObject) => entity._effects(),
  componentsTop: (entity: RpgClientObject) => entity.componentsTop(),
  componentsBottom: (entity: RpgClientObject) => entity.componentsBottom(),
  componentsCenter: (entity: RpgClientObject) => entity.componentsCenter(),
  componentsLeft: (entity: RpgClientObject) => entity.componentsLeft(),
  componentsRight: (entity: RpgClientObject) => entity.componentsRight(),
} as const;

type EntityPropMap = typeof entityPropMap;
type EntityPropKey = keyof EntityPropMap | ParamPropKey;
type EntityPropValue<K extends EntityPropKey> = K extends keyof EntityPropMap
  ? ReturnType<EntityPropMap[K]>
  : K extends `params.${string}`
  ? number | undefined
  : never;

const isSignal = <T>(value: unknown): value is Signal<T> =>
  typeof value === "function";

const toSignal = <T>(value: Signal<T> | T): Signal<T> =>
  isSignal<T>(value) ? value : computed(() => value);

export const getEntityProp = <K extends EntityPropKey>(
  entity: Signal<RpgClientObject | undefined> | RpgClientObject | undefined,
  key: K
): Signal<EntityPropValue<K>> => {
  const entitySignal = toSignal(entity);

  return computed(() => {
    const current = entitySignal();
    if (!current) {
      return undefined as EntityPropValue<K>;
    }

    if (Object.prototype.hasOwnProperty.call(entityPropMap, key)) {
      const getter = entityPropMap[key as keyof EntityPropMap];
      return getter(current) as EntityPropValue<K>;
    }

    if (key.startsWith("params.")) {
      const paramKey = key.slice("params.".length);
      return current._param?.()?.[paramKey] as EntityPropValue<K>;
    }

    return undefined as EntityPropValue<K>;
  });
};
