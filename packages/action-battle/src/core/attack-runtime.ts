import type {
  ActionBattleAttackHitPolicy,
  ActionBattleOptions,
  NormalizedActionBattleAttackProfile,
} from "../types";
import type { ActionBattleHitbox } from "./contracts";
import { normalizeActionBattleAttackProfile } from "./attack-profile";

export const ACTION_BATTLE_HITBOX_FRAME_MS = 16;

export function getNormalizedActionBattleAttackProfile(
  options: ActionBattleOptions = {}
): NormalizedActionBattleAttackProfile {
  const attack = options.attack ?? {};
  return normalizeActionBattleAttackProfile(attack.profile, {
    lockMovement: attack.lockMovement,
    lockDurationMs: attack.lockDurationMs,
    hitboxes: attack.hitboxes,
  });
}

export function resolveActionBattleHitboxSpeed(
  profile: NormalizedActionBattleAttackProfile,
  hitboxCount: number
): number {
  const positions = Math.max(1, Math.floor(hitboxCount));
  const activeFrames = Math.max(
    1,
    Math.ceil(profile.activeMs / ACTION_BATTLE_HITBOX_FRAME_MS)
  );
  return Math.max(1, Math.ceil(activeFrames / positions));
}

export function scheduleActionBattleStartup(
  profile: NormalizedActionBattleAttackProfile,
  callback: () => void,
  scheduler: (callback: () => void, delayMs: number) => unknown = setTimeout
) {
  if (profile.startupMs <= 0) {
    callback();
    return null;
  }
  return scheduler(callback, profile.startupMs);
}

export function runActionBattleActiveHitbox(
  profile: NormalizedActionBattleAttackProfile,
  resolveHitboxes: () => ActionBattleHitbox[],
  onHitboxes: (hitboxes: ActionBattleHitbox[]) => void,
  scheduler: (callback: () => void, delayMs: number) => unknown = setTimeout
) {
  const frames = Math.max(
    1,
    Math.ceil(profile.activeMs / ACTION_BATTLE_HITBOX_FRAME_MS)
  );
  let frame = 0;

  const step = () => {
    const hitboxes = resolveHitboxes();
    if (hitboxes.length > 0) {
      onHitboxes(hitboxes);
    }
    frame++;
    if (frame < frames) {
      scheduler(step, ACTION_BATTLE_HITBOX_FRAME_MS);
    }
  };

  if (profile.startupMs <= 0) {
    step();
    return null;
  }

  return scheduler(step, profile.startupMs);
}

let attackIdCounter = 0;

export function createActionBattleAttackId(
  attackerId: string | number | undefined,
  profileId: string
): string {
  attackIdCounter++;
  return `${attackerId ?? "unknown"}:${profileId}:${Date.now()}:${attackIdCounter}`;
}

const getTargetKey = (target: { id?: string | number } | undefined) => {
  if (!target || target.id === undefined || target.id === null) return null;
  return String(target.id);
};

export class ActionBattleHitTracker {
  private hitTargets = new Set<string>();

  constructor(private readonly hitPolicy: ActionBattleAttackHitPolicy) {}

  canHit(target: { id?: string | number } | undefined): boolean {
    if (this.hitPolicy === "allowRepeatHits") return true;
    const key = getTargetKey(target);
    return !key || !this.hitTargets.has(key);
  }

  recordHit(target: { id?: string | number } | undefined): void {
    const key = getTargetKey(target);
    if (key) {
      this.hitTargets.add(key);
    }
  }

  tryHit(target: { id?: string | number } | undefined): boolean {
    if (!this.canHit(target)) return false;
    this.recordHit(target);
    return true;
  }
}
