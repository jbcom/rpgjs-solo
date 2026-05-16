import { RpgEvent, RpgPlayer, type RpgServer } from "@rpgjs/server";
import { Control, defineModule } from "@rpgjs/common";
import { BattleAi, HitResult, ApplyHitHooks, DEFAULT_KNOCKBACK } from "./ai.server";
import {
  ActionBattleActionBarData,
  ActionBattleActionBarSkill,
  ActionBattleOptions,
} from "./types";
import { normalizeActionBattleOptions, setActionBattleOptions } from "./config";
import { manhattanDistance, parseAoeMask } from "./targeting";
import { playActionBattleAnimation } from "./animations";
import { getActionBattleSystems, setActionBattleSystems } from "./core/context";
import { applyActionBattleHit } from "./core/hit";
import { DEFAULT_ZELDA_PLAYER_HITBOXES } from "./core/defaults";
import {
  ActionBattleHitTracker,
  createActionBattleAttackId,
  getNormalizedActionBattleAttackProfile,
  resolveActionBattleHitboxSpeed,
  scheduleActionBattleStartup,
} from "./core/attack-runtime";
import { normalizeActionBattleAttackProfile } from "./core/attack-profile";
import { resolveActionBattleWeaponAttackProfile } from "./core/equipment";
import type { ActionBattleHitbox } from "./core/contracts";
import type {
  ActionBattleAttackProfile,
  NormalizedActionBattleAttackProfile,
} from "./types";

export const ACTION_BATTLE_ACTION_BAR_GUI_ID = "action-battle-action-bar";
const DEFAULT_ATTACK_LOCK_DURATION_MS = 350;

/**
 * Default player attack hitboxes offsets for each direction
 * 
 * These hitboxes define the attack areas relative to the player's position
 * for each cardinal direction. They are converted to absolute coordinates
 * when creating the moving hitbox.
 */
export const DEFAULT_PLAYER_ATTACK_HITBOXES = {
  ...DEFAULT_ZELDA_PLAYER_HITBOXES,
};

const beginPlayerAttackLock = (
  player: RpgPlayer,
  map: ReturnType<RpgPlayer["getCurrentMap"]> | undefined,
  durationMs: number,
  locks: { movement: boolean; direction: boolean }
): boolean => {
  if (durationMs <= 0) return true;

  const runtimePlayer = player as any;
  const now = Date.now();
  if (
    typeof runtimePlayer.__actionBattleAttackLockedUntil === "number" &&
    runtimePlayer.__actionBattleAttackLockedUntil > now
  ) {
    return false;
  }

  const lockId = (runtimePlayer.__actionBattleAttackLockId ?? 0) + 1;
  runtimePlayer.__actionBattleAttackLockId = lockId;
  runtimePlayer.__actionBattleAttackLockedUntil = now + durationMs;

  const previousCanMove = player.canMove;
  const previousDirectionFixed = player.directionFixed;
  const previousAnimationFixed = player.animationFixed;

  if (locks.movement) {
    player.pendingInputs = [];
    player.lastProcessedInputTs = 0;
    (map as any)?.stopMovement?.(player);
    player.canMove = false;
  }
  if (locks.direction) {
    player.directionFixed = true;
  }

  setTimeout(() => {
    if (runtimePlayer.__actionBattleAttackLockId !== lockId) return;
    runtimePlayer.__actionBattleAttackLockedUntil = 0;
    player.canMove = previousCanMove;
    player.directionFixed = previousDirectionFixed;
    player.animationFixed = previousAnimationFixed;
  }, durationMs);

  return true;
};

const isBattleEvent = (event: RpgEvent) => !!(event as any).battleAi;

const rectsOverlap = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

const eventRect = (event: RpgEvent) => {
  const hitbox =
    typeof event.hitbox === "function" ? event.hitbox() : (event as any).hitbox;
  return {
    x: event.x(),
    y: event.y(),
    width: hitbox?.w ?? 32,
    height: hitbox?.h ?? 32,
  };
};

const getVisibleActionEvents = (
  player: RpgPlayer,
  map: ReturnType<RpgPlayer["getCurrentMap"]> | undefined,
  hitboxes: Array<{ x: number; y: number; width: number; height: number }>
) => {
  if (!map) return [];

  const eventsById = new Map<string, RpgEvent>();
  const addEvent = (event: RpgEvent | undefined) => {
    if (!event) return;
    const isVisible =
      typeof (map as any).isEventVisibleForPlayer === "function"
        ? (map as any).isEventVisibleForPlayer(event, player)
        : true;
    if (!isVisible) return;
    eventsById.set(event.id, event);
  };

  const collisions = (map as any).getCollisions?.(player.id);
  if (Array.isArray(collisions)) {
    collisions.forEach((id: string) => addEvent(map.getEvent(id)));
  }

  const direction =
    typeof player.getDirection === "function" ? player.getDirection() : undefined;
  const interactionCollisions = (map as any).getInteractionCollisions?.(
    player.id,
    direction
  );
  if (Array.isArray(interactionCollisions)) {
    interactionCollisions.forEach((id: string) => addEvent(map.getEvent(id)));
  }

  for (const event of map.getEvents()) {
    const rect = eventRect(event);
    if (hitboxes.some((hitbox) => rectsOverlap(hitbox, rect))) {
      addEvent(event);
    }
  }

  return Array.from(eventsById.values());
};

const isActionReservedForNormalEvent = (
  player: RpgPlayer,
  map: ReturnType<RpgPlayer["getCurrentMap"]> | undefined,
  hitboxes: Array<{ x: number; y: number; width: number; height: number }>
) => {
  const events = getVisibleActionEvents(player, map, hitboxes);
  return events.length > 0 && !events.some(isBattleEvent);
};

/**
 * Get knockback force from player's equipped weapon
 * 
 * Retrieves the knockbackForce property from the player's equipped weapon.
 * Falls back to DEFAULT_KNOCKBACK.force if no weapon or property is set.
 * 
 * @param player - The player to get weapon knockback from
 * @returns Knockback force value
 * 
 * @example
 * ```ts
 * // Player with weapon having knockbackForce: 80
 * const force = getPlayerWeaponKnockbackForce(player); // 80
 * 
 * // No weapon equipped
 * const force = getPlayerWeaponKnockbackForce(player); // 50 (default)
 * ```
 */
export function getPlayerWeaponKnockbackForce(player: RpgPlayer): number {
  try {
    const equipments = player.equipments?.() || [];
    for (const item of equipments) {
      const itemData = (player as any).databaseById?.(item.id());
      if (itemData?._type === 'weapon' && itemData.knockbackForce !== undefined) {
        return itemData.knockbackForce;
      }
    }
  } catch {
    // If error, return default
  }
  return DEFAULT_KNOCKBACK.force;
}

/**
 * Apply hit from player to target (event with AI)
 * 
 * Handles damage calculation, knockback based on weapon, and visual effects.
 * Can be customized using hooks.
 * 
 * @param player - The attacking player
 * @param target - The event being hit
 * @param hooks - Optional hooks for customizing hit behavior
 * @returns Hit result if AI exists, undefined otherwise
 * 
 * @example
 * ```ts
 * // Basic hit
 * const result = applyPlayerHitToEvent(player, event);
 * 
 * // With custom hooks
 * const result = applyPlayerHitToEvent(player, event, {
 *   onBeforeHit(result) {
 *     result.knockbackForce *= 2; // Double knockback
 *     return result;
 *   },
 *   onAfterHit(result) {
 *     if (result.defeated) {
 *       player.gold += 10;
 *     }
 *   }
 * });
 * ```
 */
export function applyPlayerHitToEvent(
  player: RpgPlayer, 
  target: RpgEvent, 
  hooks?: ApplyHitHooks,
  metadata?: Record<string, any>
): HitResult | undefined {
  const ai = (target as any).battleAi as BattleAi;
  if (!ai) return undefined;

  const systems = getActionBattleSystems();
  const result = applyActionBattleHit(
    {
      ...systems.combat,
      hooks: hooks
        ? {
            ...systems.combat.hooks,
            beforeHit(context) {
              const before = systems.combat.hooks?.beforeHit?.(context);
              if (before === false) return false;
              const nextContext = before || context;
              const legacyResult = toLegacyHitResult(nextContext);
              const modified = hooks.onBeforeHit?.(legacyResult);
              if (!modified) return nextContext;
              return {
                ...nextContext,
                damage: {
                  damage: modified.damage,
                  defeated: modified.defeated,
                  raw: nextContext.damage?.raw,
                },
                knockback: {
                  force: modified.knockbackForce,
                  duration: modified.knockbackDuration,
                  direction: nextContext.knockback?.direction,
                },
              };
            },
            afterHit(result) {
              systems.combat.hooks?.afterHit?.(result);
              hooks.onAfterHit?.(result as HitResult);
            },
          }
        : systems.combat.hooks,
    },
    {
      attacker: player,
      target,
      metadata,
      reaction: metadata?.reaction,
    }
  );

  if (!result.cancelled) {
    ai.handleDamage(player, {
      damage: result.damage,
      defeated: result.defeated,
      raw: result.rawDamage,
      reaction: result.reaction,
    });
  }

  return result as HitResult;
}

const toLegacyHitResult = (context: any): HitResult => ({
  damage: context.damage?.damage ?? 0,
  knockbackForce: context.knockback?.force ?? getPlayerWeaponKnockbackForce(context.attacker),
  knockbackDuration: context.knockback?.duration ?? DEFAULT_KNOCKBACK.duration,
  defeated: context.damage?.defeated ?? false,
  attacker: context.attacker,
  target: context.target,
});

const resolvePlayerAttackHitboxes = (
  player: RpgPlayer,
  directionKey: string,
  options: ActionBattleOptions,
  profile: NormalizedActionBattleAttackProfile
): ActionBattleHitbox[] => {
  const configuredHitboxes = {
    ...DEFAULT_PLAYER_ATTACK_HITBOXES,
    ...options.attack?.hitboxes,
    ...profile.hitboxes,
  };
  const hitboxConfig =
    configuredHitboxes[
      directionKey as keyof typeof DEFAULT_PLAYER_ATTACK_HITBOXES
    ] || configuredHitboxes.default;
  const defaultHitboxes = [
    {
      x: player.x() + hitboxConfig.offsetX,
      y: player.y() + hitboxConfig.offsetY,
      width: hitboxConfig.width,
      height: hitboxConfig.height,
    },
  ];
  return (
    options.attack?.resolveHitboxes?.({
      player,
      direction: directionKey,
      defaultHitboxes,
    }) ?? defaultHitboxes
  );
};

const mergeAttackProfileOverrides = (
  base: NormalizedActionBattleAttackProfile,
  override: ActionBattleAttackProfile
): ActionBattleAttackProfile => ({
  ...base,
  ...override,
  reaction: {
    ...base.reaction,
    ...override.reaction,
  },
  hitboxes: {
    ...base.hitboxes,
    ...override.hitboxes,
  },
});

const resolvePlayerAttackProfile = (
  player: RpgPlayer,
  options: ActionBattleOptions
): NormalizedActionBattleAttackProfile => {
  const baseProfile = getNormalizedActionBattleAttackProfile(options);
  const weaponProfile = resolveActionBattleWeaponAttackProfile(player);
  if (!weaponProfile) return baseProfile;
  return normalizeActionBattleAttackProfile(
    mergeAttackProfileOverrides(baseProfile, weaponProfile),
    {
      lockMovement: options.attack?.lockMovement,
      lockDurationMs: options.attack?.lockDurationMs,
      hitboxes: options.attack?.hitboxes,
    }
  );
};

const resolveSignal = (value: any) =>
  typeof value === "function" ? value() : value;

const resolveItemData = (player: RpgPlayer, itemId: string) => {
  try {
    return (player as any).databaseById?.(itemId);
  } catch {
    return null;
  }
};

const resolveSkillData = (player: RpgPlayer, skillId: string) => {
  try {
    return (player as any).databaseById?.(skillId);
  } catch {
    return null;
  }
};

const resolveSkillTargeting = (
  player: RpgPlayer,
  skillId: string,
  options: ActionBattleOptions
) => {
  const skillsOptions = options.skills;
  const skillData = resolveSkillData(player, skillId);
  if (skillsOptions?.getTargeting) {
    return skillsOptions.getTargeting(skillData);
  }
  const range =
    skillData?.range ??
    skillData?.targeting?.range ??
    (skillData?.targeting?.distance as number | undefined);
  const aoeMask =
    skillData?.aoeMask ??
    skillData?.targeting?.aoeMask ??
    (skillData?.targeting?.mask as string[] | string | undefined);
  if (range === undefined && aoeMask === undefined) {
    return null;
  }
  return {
    range: range ?? 0,
    aoeMask,
  };
};

const normalizeMaskRows = (mask: string[] | string | undefined) => {
  if (!mask) return [];
  if (Array.isArray(mask)) return mask;
  return mask
    .trim()
    .split("\n")
    .map((row: string) => row.replace(/\r/g, ""));
};

const buildActionBarData = (
  player: RpgPlayer,
  options: ActionBattleOptions
): ActionBattleActionBarData => {
  const items = (player.items?.() || []).map((item: any) => {
    const id = item.id?.() ?? item.id;
    const data = resolveItemData(player, id);
    const name = resolveSignal(data?.name) ?? resolveSignal(item.name) ?? id;
    const description =
      resolveSignal(data?.description) ??
      resolveSignal(item.description) ??
      "";
    const icon = resolveSignal(data?.icon) ?? resolveSignal(item.icon);
    const quantity = resolveSignal(item.quantity) ?? 1;
    const consumable = resolveSignal(data?.consumable);
    const itemType = resolveSignal(data?._type);
    const usable =
      quantity > 0 &&
      consumable !== false &&
      (itemType ? itemType === "item" : true);
    return {
      id,
      name,
      description,
      icon,
      quantity,
      usable,
    };
  });

  const skills = (player.skills?.() || []).map((skill: any) => {
    const id = skill.id?.() ?? skill.id;
    const data = resolveSkillData(player, id) || skill;
    const name = resolveSignal(data?.name) ?? resolveSignal(skill.name) ?? id;
    const description =
      resolveSignal(data?.description) ??
      resolveSignal(skill.description) ??
      "";
    const icon = resolveSignal(data?.icon) ?? resolveSignal(skill.icon);
    const spCost =
      resolveSignal(data?.spCost) ?? resolveSignal(skill.spCost) ?? 0;
    const usable = spCost <= player.sp;
    const targeting = resolveSkillTargeting(player, id, options);
    const skillEntry: ActionBattleActionBarSkill = {
      id,
      name,
      description,
      icon,
      spCost,
      usable,
      range: targeting?.range ?? 0,
    };
    if (targeting) {
      const mask = targeting.aoeMask ?? options.skills?.defaultAoeMask;
      if (mask) {
        skillEntry.aoeMask = normalizeMaskRows(mask);
      }
    }
    return skillEntry;
  });

  return { items, skills };
};

const ensureActionBarGui = (
  player: RpgPlayer,
  options: ActionBattleOptions
) => {
  const existing = player.getGui?.(ACTION_BATTLE_ACTION_BAR_GUI_ID);
  const gui = existing || player.gui(ACTION_BATTLE_ACTION_BAR_GUI_ID);
  if (!(gui as any).__actionBattleReady) {
    (gui as any).__actionBattleReady = true;
    gui.on("useItem", ({ id }: { id: string }) => {
      try {
        player.useItem(id);
      } catch {
        // Ignore failures (not usable, not enough, etc.)
      }
      gui.update(buildActionBarData(player, options));
    });
    gui.on(
      "useSkill",
      ({ id, target }: { id: string; target?: { x: number; y: number } }) => {
        handleActionBattleSkillUse(player, id, target, options);
        gui.update(buildActionBarData(player, options));
      }
    );
    gui.on("refresh", () => {
      gui.update(buildActionBarData(player, options));
    });
  }
  return gui;
};

export const openActionBattleActionBar = (
  player: RpgPlayer,
  rawOptions: ActionBattleOptions = {}
) => {
  const options = normalizeActionBattleOptions(rawOptions);
  const gui = ensureActionBarGui(player, options);
  gui.open(buildActionBarData(player, options));
};

export const updateActionBattleActionBar = (
  player: RpgPlayer,
  rawOptions: ActionBattleOptions = {}
) => {
  const options = normalizeActionBattleOptions(rawOptions);
  const gui = player.getGui?.(ACTION_BATTLE_ACTION_BAR_GUI_ID);
  if (gui) {
    gui.update(buildActionBarData(player, options));
  }
};

const getTileSize = (map: any) => ({
  width: map?.tileWidth ?? 32,
  height: map?.tileHeight ?? 32,
});

const getEntityTile = (
  entity: any,
  tileSize: { width: number; height: number }
) => {
  const hitbox = entity.hitbox?.() || { w: tileSize.width, h: tileSize.height };
  const x = Math.floor((entity.x() + hitbox.w / 2) / tileSize.width);
  const y = Math.floor((entity.y() + hitbox.h / 2) / tileSize.height);
  return { x, y };
};

const handleActionBattleSkillUse = (
  player: RpgPlayer,
  skillId: string,
  target: { x: number; y: number } | undefined,
  options: ActionBattleOptions
) => {
  const skillData = resolveSkillData(player, skillId);

  const map = player.getCurrentMap();
  if (!map) {
    playActionBattleAnimation("castSkill", player, options.animations, {
      skill: skillData,
    });
    player.useSkill(skillId);
    return;
  }
  const targeting = resolveSkillTargeting(player, skillId, options);
  if (!targeting || !target) {
    playActionBattleAnimation("castSkill", player, options.animations, {
      skill: skillData,
    });
    player.useSkill(skillId);
    return;
  }

  const tileSize = getTileSize(map);
  const origin = getEntityTile(player, tileSize);
  const targetTile = { x: target.x, y: target.y };

  if (manhattanDistance(origin, targetTile) > targeting.range) {
    return;
  }

  const mask = parseAoeMask(
    targeting.aoeMask || options.skills?.defaultAoeMask
  );
  const affected = new Set<string>();
  mask.cells.forEach((cell) => {
    const x = targetTile.x + cell.dx;
    const y = targetTile.y + cell.dy;
    affected.add(`${x},${y}`);
  });

  const targets: any[] = [];
  const affects = options.targeting?.affects || "events";
  if (affects === "events" || affects === "both") {
    map.getEvents().forEach((event: RpgEvent) => {
      const tile = getEntityTile(event, tileSize);
      if (affected.has(`${tile.x},${tile.y}`)) {
        targets.push(event);
      }
    });
  }
  if (affects === "players" || affects === "both") {
    map.getPlayers().forEach((other: RpgPlayer) => {
      if (other.id === player.id) return;
      const tile = getEntityTile(other, tileSize);
      if (affected.has(`${tile.x},${tile.y}`)) {
        targets.push(other);
      }
    });
  }

  if (!options.targeting?.allowEmptyTarget && targets.length === 0) {
    return;
  }

  playActionBattleAnimation("castSkill", player, options.animations, {
    skill: skillData,
    target: targets[0],
  });
  player.useSkill(skillId, targets as any);
};

export const createActionBattleServer = (
  rawOptions: ActionBattleOptions = {}
) => {
  const options = normalizeActionBattleOptions(rawOptions);
  setActionBattleOptions(options);
  setActionBattleSystems(options);
  return defineModule<RpgServer>({
    player: {
      /**
       * Handle player input for combat actions
       *
       * When a player presses the action key, create an attack hitbox
       * that can damage AI enemies within range and knockback the event.
       * Knockback force is based on the player's equipped weapon.
       * Triggers attack animation and visual effects.
       *
       * @param player - The player performing the action
       * @param input - Input data containing pressed keys
       */
      onInput(player: RpgPlayer, input: any) {
        if (input.action == Control.Action) {
          const map = player.getCurrentMap();
          const direction = player.getDirection();
          const attackProfile = resolvePlayerAttackProfile(player, options);

          // Convert Direction enum to string key
          const directionKey = direction as string;

          const hitboxes = resolvePlayerAttackHitboxes(
            player,
            directionKey,
            options,
            attackProfile
          );

          if (isActionReservedForNormalEvent(player, map, hitboxes)) {
            return;
          }

          const lockMovement = attackProfile.movementLock;
          const lockDirection = attackProfile.directionLock;
          const lockDurationMs =
            attackProfile.totalDurationMs ?? DEFAULT_ATTACK_LOCK_DURATION_MS;
          const actionLocked = (lockMovement || lockDirection) && lockDurationMs > 0;

          if (
            actionLocked &&
            !beginPlayerAttackLock(player, map, Math.max(0, lockDurationMs), {
              movement: lockMovement,
              direction: lockDirection,
            })
          ) {
            return;
          }

          playActionBattleAnimation("attack", player, options.animations);
          if (actionLocked) {
            player.animationFixed = true;
          }
          const attackId = createActionBattleAttackId(
            player.id,
            attackProfile.id
          );
          const hitTracker = new ActionBattleHitTracker(
            attackProfile.hitPolicy
          );
          if (options.debug?.attacks) {
            console.log("[ActionBattle] player attack", {
              attackId,
              playerId: player.id,
              profile: attackProfile.id,
              hitboxes,
            });
          }

          scheduleActionBattleStartup(attackProfile, () => {
            map
              ?.createMovingHitbox(hitboxes, {
                speed: resolveActionBattleHitboxSpeed(
                  attackProfile,
                  hitboxes.length
                ),
              })
              .subscribe({
                next(hits: any[]) {
                  hits.forEach((hit: any) => {
                    if (hit instanceof RpgEvent) {
                      if (!hitTracker.tryHit(hit)) return;
                      const result = applyPlayerHitToEvent(
                        player,
                        hit,
                        undefined,
                        {
                          attackId,
                          attackProfileId: attackProfile.id,
                          reaction: attackProfile.reaction,
                        }
                      );
                      if (result?.defeated) {
                        console.log(`Player ${player.id} defeated AI ${hit.id}`);
                      }
                    }
                  });
                },
              });
          });
        }
      },
      onConnected(player: RpgPlayer) {
        if (options.ui?.actionBar?.enabled && options.ui?.actionBar?.autoOpen) {
          openActionBattleActionBar(player, options);
        }
      },
    },
    event: {
      /**
       * Handle player detection when entering AI vision
       *
       * Called when a player enters an AI event's vision range.
       * The AI will start pursuing and attacking the player.
       *
       * @param event - The AI event
       * @param player - The player entering vision
       * @param shape - The vision shape
       */
      onDetectInShape(event: RpgEvent, player: RpgPlayer, shape: any) {
        const ai = (event as any).battleAi as BattleAi;
        ai?.onDetectInShape(player, shape);
      },

      /**
       * Handle player leaving AI vision
       *
       * Called when a player leaves an AI event's vision range.
       * The AI will stop pursuing the player.
       *
       * @param event - The AI event
       * @param player - The player leaving vision
       * @param shape - The vision shape
       */
      onDetectOutShape(event: RpgEvent, player: RpgPlayer, shape: any) {
        const ai = (event as any).battleAi as BattleAi;
        ai?.onDetectOutShape(player, shape);
      },
    },
  });
};

export default createActionBattleServer();

export {
  ACTION_BATTLE_HITBOX_FRAME_MS,
  ActionBattleHitTracker,
  createActionBattleAttackId,
  getNormalizedActionBattleAttackProfile,
  resolveActionBattleHitboxSpeed,
  scheduleActionBattleStartup,
} from "./core/attack-runtime";
export {
  DEFAULT_ACTION_BATTLE_ATTACK_PROFILE,
  normalizeActionBattleAttackProfile,
  type ActionBattleAttackProfileFallbacks,
} from "./core/attack-profile";
export type {
  ActionBattleAttackDirection,
  ActionBattleAttackHitboxConfig,
  ActionBattleAttackHitboxMap,
  ActionBattleAttackHitPolicy,
  ActionBattleAttackProfile,
  ActionBattleDebugOptions,
  ActionBattleHitReactionProfile,
  NormalizedActionBattleHitReactionProfile,
  NormalizedActionBattleAttackProfile,
} from "./types";
export {
  DEFAULT_ACTION_BATTLE_HIT_REACTION,
  isActionBattleEntityInvincible,
  normalizeActionBattleHitReaction,
  setActionBattleInvincibility,
} from "./core/hit-reaction";
export {
  DEFAULT_ACTION_BATTLE_ENEMY_ATTACK_PROFILES,
  normalizeActionBattleEnemyAttackProfiles,
  type ActionBattleEnemyAttackProfileKey,
  type ActionBattleEnemyAttackProfileMap,
  type NormalizedActionBattleEnemyAttackProfileMap,
} from "./core/enemy-attack-profiles";
export { resolveActionBattleWeaponAttackProfile } from "./core/equipment";
export {
  AiDebug,
  AiState,
  AttackPattern,
  BattleAi,
  DEFAULT_KNOCKBACK,
  EnemyType,
} from "./ai.server";
export type {
  ApplyHitHooks,
  BattleAiDefeatedCallback,
  BattleAiDefeatedContext,
  BattleAiDefeatReward,
  BattleAiLegacyDefeatedCallback,
  BattleAiLegacyOptions,
  BattleAiOptions,
  BattleAiRewardItem,
  BattleAiRewards,
  HitResult,
} from "./ai.server";
