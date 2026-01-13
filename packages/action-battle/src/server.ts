import { RpgEvent, RpgPlayer, type RpgServer } from "@rpgjs/server";
import { Control, defineModule } from "@rpgjs/common";
import { BattleAi, HitResult, ApplyHitHooks, DEFAULT_KNOCKBACK } from "./ai.server";

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

export default defineModule<RpgServer>({
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
        // Trigger attack animation
        player.setGraphicAnimation('attack', 1);

        // Get player position
        const playerX = player.x();
        const playerY = player.y();
        const direction = player.getDirection();

        // Convert Direction enum to string key
        const directionKey = direction as string;

        // Get hitbox configuration for the direction
        const hitboxConfig = DEFAULT_PLAYER_ATTACK_HITBOXES[directionKey as keyof typeof DEFAULT_PLAYER_ATTACK_HITBOXES] || DEFAULT_PLAYER_ATTACK_HITBOXES.default;
        
        // Convert relative hitbox to absolute coordinates
        const hitboxes: Array<{
          x: number;
          y: number;
          width: number;
          height: number;
        }> = [{
          x: playerX + hitboxConfig.offsetX,
          y: playerY + hitboxConfig.offsetY,
          width: hitboxConfig.width,
          height: hitboxConfig.height
        }];

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