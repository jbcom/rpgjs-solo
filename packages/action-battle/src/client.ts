import { inject, PrebuiltComponentAnimations, RpgClient, RpgClientEngine, RpgGui } from "@rpgjs/client";
import { defineModule } from "@rpgjs/common";
// @ts-ignore CanvasEngine components are compiled by @canvasengine/compiler.
import ActionBarComponent from "./components/action-bar.ce";
// @ts-ignore CanvasEngine components are compiled by @canvasengine/compiler.
import TargetingOverlayComponent from "./components/targeting-overlay.ce";
// @ts-ignore CanvasEngine components are compiled by @canvasengine/compiler.
import AttackPreviewComponent from "./components/attack-preview.ce";
import {
  setActionBattleOptions,
  startAttackPreview,
  stopAttackPreview,
} from "./ui/state";
import { ActionBattleOptions } from "./types";
import { normalizeActionBattleOptions } from "./config";
import { resolveActionBattleAnimation } from "./animations";
import { getNormalizedActionBattleAttackProfile } from "./core/attack-runtime";

const DEFAULT_ATTACK_LOCK_DURATION_MS = 350;

const beginLocalPlayerAttackLock = (
  engine: RpgClientEngine,
  durationMs: number,
  locks: { movement: boolean; direction: boolean }
): boolean => {
  if (durationMs <= 0) return true;

  const player = engine.scene?.getCurrentPlayer?.() as any;
  if (!player) return true;

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
    if (typeof engine.interruptCurrentPlayerMovement === "function") {
      engine.interruptCurrentPlayerMovement(player);
    } else {
      (engine.scene as any)?.stopMovement?.(player);
    }
    player.canMove = false;
  }
  if (locks.direction) {
    player.directionFixed = true;
  }
  player.animationFixed = true;

  setTimeout(() => {
    if (runtimePlayer.__actionBattleAttackLockId !== lockId) return;
    runtimePlayer.__actionBattleAttackLockedUntil = 0;
    player.canMove = previousCanMove;
    player.directionFixed = previousDirectionFixed;
    player.animationFixed = previousAnimationFixed;
  }, durationMs);

  return true;
};

const resolveLocalPlayerDirection = (player: any) => {
  if (typeof player.getDirection === "function") return player.getDirection();
  if (typeof player.direction === "function") return player.direction();
  return player.direction ?? "down";
};

const playLocalPlayerAttackAnimation = (
  player: any,
  options: ActionBattleOptions
) => {
  if (!player || typeof player.setAnimation !== "function") return;
  const animation = resolveActionBattleAnimation(
    "attack",
    player,
    options.animations
  );
  if (!animation) return;

  if (animation.graphic !== undefined) {
    player.setAnimation(
      animation.animationName,
      animation.graphic,
      animation.repeat
    );
    return;
  }
  player.setAnimation(animation.animationName, animation.repeat);
};

const showLocalAttackPreview = (player: any, options: ActionBattleOptions) => {
  if (!player || options.attack?.showPreview === false) return;
  const durationMs = Math.max(1, options.attack?.previewDurationMs ?? 180);
  const previewId = startAttackPreview({
    direction: resolveLocalPlayerDirection(player),
    durationMs,
    color: options.attack?.previewColor,
    accentColor: options.attack?.previewAccentColor,
  });
  setTimeout(() => stopAttackPreview(previewId), durationMs);
};

export const createActionBattleClient = (
  options: ActionBattleOptions = {}
) => {
  const normalized = normalizeActionBattleOptions(options);
  setActionBattleOptions(normalized);
  const actionBarEnabled = normalized.ui?.actionBar?.enabled;
  const targetingEnabled = normalized.ui?.targeting?.enabled;
  const componentsInFront = [
    ...(targetingEnabled ? [TargetingOverlayComponent] : []),
    AttackPreviewComponent,
  ];
  const hitComponent = PrebuiltComponentAnimations?.Hit;
  return defineModule<RpgClient>({
    componentAnimations: hitComponent
      ? [
          {
            id: "hit",
            component: hitComponent,
          },
        ]
      : [],
    gui: actionBarEnabled
      ? [
          {
            id: "action-battle-action-bar",
            component: ActionBarComponent,
            dependencies: () => {
              const engine = inject(RpgClientEngine)
              return [engine.scene.currentPlayer]
            },
          },
        ]
      : [],
    sprite: {
      componentsInFront,
    },
    sceneMap: {
      onAfterLoading() {
        if (actionBarEnabled && normalized.ui?.actionBar?.autoOpen) {
          const gui = inject(RpgGui)
          gui.display('action-battle-action-bar')
        }
      }
    },
    engine: {
      onInput(engine: RpgClientEngine, { input }: { input: string }) {
        if (input !== "action") return;
        const player = engine.scene?.getCurrentPlayer?.() as any;
        if (!player) return;
        const attackProfile = getNormalizedActionBattleAttackProfile(normalized);
        const lockDurationMs = Math.max(
          0,
          attackProfile.totalDurationMs ?? DEFAULT_ATTACK_LOCK_DURATION_MS
        );
        if (attackProfile.movementLock || attackProfile.directionLock) {
          beginLocalPlayerAttackLock(engine, lockDurationMs, {
            movement: attackProfile.movementLock,
            direction: attackProfile.directionLock,
          });
        }
        playLocalPlayerAttackAnimation(player, normalized);
        showLocalAttackPreview(player, normalized);
      },
    }
  });
};

export default createActionBattleClient();
