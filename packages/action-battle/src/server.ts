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

export const ACTION_BATTLE_ACTION_BAR_GUI_ID = "action-battle-action-bar";

/**
 * Default player attack hitboxes offsets for each direction
 * 
 * These hitboxes define the attack areas relative to the player's position
 * for each cardinal direction. They are converted to absolute coordinates
 * when creating the moving hitbox.
 */
export const DEFAULT_PLAYER_ATTACK_HITBOXES = {
  up: { offsetX: -16, offsetY: -48, width: 32, height: 32 },
  down: { offsetX: -16, offsetY: 16, width: 32, height: 32 },
  left: { offsetX: -48, offsetY: -16, width: 32, height: 32 },
  right: { offsetX: 16, offsetY: -16, width: 32, height: 32 },
  default: { offsetX: 0, offsetY: -32, width: 32, height: 32 }
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
  hooks?: ApplyHitHooks
): HitResult | undefined {
  const ai = (target as any).battleAi as BattleAi;
  if (!ai) return undefined;

  // Get knockback force from player's weapon
  const knockbackForce = getPlayerWeaponKnockbackForce(player);

  // Apply damage to AI
  const defeated = ai.takeDamage(player);

  // Calculate knockback direction (away from player)
  const dx = target.x() - player.x();
  const dy = target.y() - player.y();
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Create hit result
  let hitResult: HitResult = {
    damage: 0, // Will be set by takeDamage internally
    knockbackForce,
    knockbackDuration: DEFAULT_KNOCKBACK.duration,
    defeated,
    attacker: player,
    target
  };

  // Call onBeforeHit hook
  if (hooks?.onBeforeHit) {
    const modified = hooks.onBeforeHit(hitResult);
    if (modified) {
      hitResult = modified;
    }
  }

  // Apply knockback only if not defeated (entity still exists)
  if (!hitResult.defeated && hitResult.knockbackForce > 0 && distance > 0) {
    const knockbackDirection = {
      x: dx / distance,
      y: dy / distance
    };
    target.knockback(knockbackDirection, hitResult.knockbackForce, hitResult.knockbackDuration);
  }

  // Call onAfterHit hook
  if (hooks?.onAfterHit) {
    hooks.onAfterHit(hitResult);
  }

  return hitResult;
}

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
    gui.on("useItem", ({ id }) => {
      try {
        player.useItem(id);
      } catch {
        // Ignore failures (not usable, not enough, etc.)
      }
      gui.update(buildActionBarData(player, options));
    });
    gui.on("useSkill", ({ id, target }) => {
      handleActionBattleSkillUse(player, id, target, options);
      gui.update(buildActionBarData(player, options));
    });
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
    map.getEvents().forEach((event) => {
      const tile = getEntityTile(event, tileSize);
      if (affected.has(`${tile.x},${tile.y}`)) {
        targets.push(event);
      }
    });
  }
  if (affects === "players" || affects === "both") {
    map.getPlayers().forEach((other) => {
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
          playActionBattleAnimation("attack", player, options.animations);

          // Get player position
          const playerX = player.x();
          const playerY = player.y();
          const direction = player.getDirection();

          // Convert Direction enum to string key
          const directionKey = direction as string;

          // Get hitbox configuration for the direction
          const hitboxConfig =
            DEFAULT_PLAYER_ATTACK_HITBOXES[
              directionKey as keyof typeof DEFAULT_PLAYER_ATTACK_HITBOXES
            ] || DEFAULT_PLAYER_ATTACK_HITBOXES.default;

          // Convert relative hitbox to absolute coordinates
          const hitboxes: Array<{
            x: number;
            y: number;
            width: number;
            height: number;
          }> = [
            {
              x: playerX + hitboxConfig.offsetX,
              y: playerY + hitboxConfig.offsetY,
              width: hitboxConfig.width,
              height: hitboxConfig.height,
            },
          ];

          const map = player.getCurrentMap();

          map?.createMovingHitbox(hitboxes, { speed: 3 }).subscribe({
            next(hits) {
              hits.forEach((hit) => {
                if (hit instanceof RpgEvent) {
                  const result = applyPlayerHitToEvent(player, hit);
                  if (result?.defeated) {
                    console.log(`Player ${player.id} defeated AI ${hit.id}`);
                  }
                }
              });
            },
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
