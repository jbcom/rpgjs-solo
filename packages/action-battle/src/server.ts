import { RpgEvent, RpgPlayer, type RpgServer } from "@rpgjs/server";
import { defineModule } from "@rpgjs/common";
import { BattleAi } from "./ai.server";

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

export default defineModule<RpgServer>({
  player: {
    /**
     * Handle player input for combat actions
     *
     * When a player presses the action key, create an attack hitbox
     * that can damage AI enemies within range and knockback the event.
     * Triggers attack animation and visual effects.
     *
     * @param player - The player performing the action
     * @param input - Input data containing pressed keys
     */
    onInput(player: RpgPlayer, input: any) {
      if (input.action) {
        // Trigger attack animation
        player.setAnimation('attack', 1);

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
                // Check if the event has AI
                const ai = (hit as any).battleAi as BattleAi;
                if (ai) {
                  // Apply damage to AI
                  const defeated = ai.takeDamage(player);

                  // Calculate knockback direction (away from player)
                  const dx = hit.x() - player.x();
                  const dy = hit.y() - player.y();
                  const distance = Math.sqrt(dx * dx + dy * dy);
                  
                  // Normalize direction for knockback
                  const knockbackDirection = {
                    x: distance > 0 ? dx / distance : 0,
                    y: distance > 0 ? dy / distance : 0
                  };
                  
                  // Knockback the event with stronger force
                  hit.knockback(knockbackDirection, 50, 300);

                  if (defeated) {
                    console.log(`Player ${player.id} defeated AI ${hit.id}`);
                  }
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