import type {
  BlockDefinition,
  BlockExecutor,
  SetHitboxParams,
} from '../types';
import { getEvent } from './utils';

export const schemaSetHitbox: BlockDefinition<'set_hitbox'> = {
  type: 'set_hitbox',
  label: 'Set Hitbox',
  description: 'Change the collision hitbox size of a player or event',
  category: 'character',
  icon: '▣',
  requiredCapabilities: ['map'],
  schema: {
    type: 'object',
    properties: {
      eventId: {
        type: 'string',
        title: 'Event',
        format: {
          name: 'map-position',
          displayMode: 'single-map',
          selectionMode: 'event',
          returnType: 'eventId',
          player: true,
        },
      },
      width: {
        type: 'number',
        title: 'Width',
        minimum: 1,
        default: 32,
      },
      height: {
        type: 'number',
        title: 'Height',
        minimum: 1,
        default: 32,
      },
    },
    required: ['eventId', 'width', 'height'],
  },
};

export const set_hitbox: BlockExecutor<'set_hitbox'> = async (context, params: SetHitboxParams) => {
  const target = getEvent(context, params);
  if (!target) {
    return;
  }

  const width = normalizeHitboxDimension(params.width);
  const height = normalizeHitboxDimension(params.height);
  if (!width || !height) {
    return;
  }

  applyRuntimeHitbox(context, target, width, height);
};

const normalizeHitboxDimension = (value: unknown): number | null => {
  const numberValue = typeof value === 'string' ? Number(value) : value;
  if (typeof numberValue !== 'number' || !Number.isFinite(numberValue) || numberValue <= 0) {
    return null;
  }
  return Math.round(numberValue);
};

const applyRuntimeHitbox = (
  context: Parameters<BlockExecutor<'set_hitbox'>>[0],
  target: ReturnType<typeof getEvent>,
  width: number,
  height: number,
): void => {
  if (!target) return;

  if (typeof target.setHitbox === 'function') {
    target.setHitbox(width, height);
  }

  const hitbox = typeof (target as any).hitbox === 'function'
    ? (target as any).hitbox()
    : undefined;
  if (hitbox?.w !== width || hitbox?.h !== height) {
    (target as any).hitbox?.set?.({ w: width, h: height });
  }

  const map = resolveExecutionMap(context, target);
  const id = typeof target.id === 'string' ? target.id : undefined;
  if (!id || !map) return;

  const x = readCoordinate(target, 'x');
  const y = readCoordinate(target, 'y');
  if (x !== undefined && y !== undefined) {
    map.updateHitbox?.(id, x, y, width, height);
  }

  markEventHitboxForSync(map, id, target);
  syncRuntimeHitboxChange(context, map);
};

const markEventHitboxForSync = (
  map: any,
  id: string,
  target: ReturnType<typeof getEvent>,
): void => {
  const eventsSignal = map?.events;
  if (typeof eventsSignal !== 'function') {
    return;
  }

  const events = eventsSignal();
  if (!events || events[id] !== target) {
    return;
  }

  if (typeof eventsSignal.mutate === 'function') {
    eventsSignal.mutate((draft: Record<string, unknown>) => {
      draft[id] = target;
    });
    return;
  }

  if (typeof eventsSignal.update === 'function') {
    eventsSignal.update((current: Record<string, unknown>) => ({
      ...current,
      [id]: target,
    }));
    return;
  }

  if (typeof eventsSignal.set === 'function') {
    eventsSignal.set({
      ...events,
      [id]: target,
    });
  }
};

const syncRuntimeHitboxChange = (
  context: Parameters<BlockExecutor<'set_hitbox'>>[0],
  map: any,
): void => {
  if (typeof map?.syncChanges === 'function') {
    map.syncChanges();
    return;
  }

  const player = (context as any).player;
  if (typeof player?.syncChanges === 'function') {
    player.syncChanges();
  }
};

const resolveExecutionMap = (
  context: Parameters<BlockExecutor<'set_hitbox'>>[0],
  target: ReturnType<typeof getEvent>,
): any => {
  return (
    (target as any)?.getCurrentMap?.() ??
    (context.event as any)?.getCurrentMap?.() ??
    (context.player as any)?.getCurrentMap?.() ??
    (context as any).map ??
    null
  );
};

const readCoordinate = (target: ReturnType<typeof getEvent>, key: 'x' | 'y'): number | undefined => {
  const value = (target as any)?.[key];
  const raw = typeof value === 'function' ? value.call(target) : value;
  const coordinate = Number(raw);
  return Number.isFinite(coordinate) ? coordinate : undefined;
};
