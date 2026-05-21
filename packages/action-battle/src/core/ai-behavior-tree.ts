import type { RpgEvent, RpgPlayer } from "@rpgjs/server";
import type { AiState, AttackPattern, EnemyType } from "../ai.server";
import type {
  ActionBattleAiContext,
  ActionBattleAiDecision,
} from "./contracts";

export type ActionBattleAiTreeStatus = "success" | "failure" | "running";

export type ActionBattleAiMemory = Record<string, any>;

export interface ActionBattleAiIntentBase {
  consume?: boolean;
  metadata?: Record<string, any>;
}

export type ActionBattleAiIntent =
  | (ActionBattleAiIntentBase & { type: "idle" })
  | (ActionBattleAiIntentBase & { type: "patrol" })
  | (ActionBattleAiIntentBase & { type: "faceTarget" })
  | (ActionBattleAiIntentBase & { type: "moveToTarget" })
  | (ActionBattleAiIntentBase & { type: "fleeFromTarget" })
  | (ActionBattleAiIntentBase & {
      type: "keepDistance";
      distance: number;
      tolerance?: number;
    })
  | (ActionBattleAiIntentBase & {
      type: "useAttack";
      pattern?: AttackPattern | string;
    })
  | (ActionBattleAiIntentBase & {
      type: "useSkill";
      skill: any;
    })
  | (ActionBattleAiIntentBase & {
      type: "setMode";
      mode: NonNullable<ActionBattleAiDecision["mode"]>;
    });

export interface ActionBattleAiSnapshotSelf {
  event: RpgEvent;
  state: AiState;
  enemyType: EnemyType;
  hpPercent: number | null;
  attackRange: number;
}

export interface ActionBattleAiSnapshotTarget {
  entity: RpgPlayer;
  distance: number;
  inAttackRange: boolean;
  visible: boolean;
}

export interface ActionBattleAiTreeContext extends ActionBattleAiContext {
  self: ActionBattleAiSnapshotSelf;
  targetInfo: ActionBattleAiSnapshotTarget | null;
  memory: ActionBattleAiMemory;
}

export interface ActionBattleAiTreeResult {
  status: ActionBattleAiTreeStatus;
  decision?: ActionBattleAiDecision;
  intent?: ActionBattleAiIntent | ActionBattleAiIntent[];
}

export interface ActionBattleAiTreeNode {
  tick(context: ActionBattleAiTreeContext): ActionBattleAiTreeResult;
}

export type ActionBattleAiTreeInput =
  | ActionBattleAiTreeNode
  | ((context: ActionBattleAiTreeContext) => ActionBattleAiTreeResult | void);

export type ActionBattleAiCondition = (
  context: ActionBattleAiTreeContext
) => boolean;

export type ActionBattleAiIntentInput =
  | ActionBattleAiIntent
  | ActionBattleAiIntent[]
  | ActionBattleAiTreeNode
  | ((context: ActionBattleAiTreeContext) => ActionBattleAiIntent | ActionBattleAiIntent[]);

export interface ActionBattleAiRule {
  condition: ActionBattleAiCondition;
  then: ActionBattleAiIntentInput;
}

export interface ActionBattleAiSimpleBehavior {
  when?: ActionBattleAiRule[];
  otherwise?: ActionBattleAiIntentInput;
}

const isTreeNode = (input: unknown): input is ActionBattleAiTreeNode =>
  Boolean(input && typeof (input as ActionBattleAiTreeNode).tick === "function");

const normalizeTreeResult = (
  result: ActionBattleAiTreeResult | void
): ActionBattleAiTreeResult => result ?? { status: "failure" };

const runIntentInput = (
  input: ActionBattleAiIntentInput,
  context: ActionBattleAiTreeContext
): ActionBattleAiTreeResult => {
  if (isTreeNode(input)) return input.tick(context);
  const intent = typeof input === "function" ? input(context) : input;
  return { status: "success", intent };
};

export const defineAiTree = (
  input: ActionBattleAiTreeInput
): ActionBattleAiTreeNode => {
  if (isTreeNode(input)) return input;
  return {
    tick(context) {
      return normalizeTreeResult(input(context));
    },
  };
};

export const selector = (
  children: ActionBattleAiTreeInput[]
): ActionBattleAiTreeNode => ({
  tick(context) {
    for (const child of children) {
      const result = defineAiTree(child).tick(context);
      if (result.status !== "failure") return result;
    }
    return { status: "failure" };
  },
});

export const sequence = (
  children: ActionBattleAiTreeInput[]
): ActionBattleAiTreeNode => ({
  tick(context) {
    let last: ActionBattleAiTreeResult = { status: "success" };
    for (const child of children) {
      last = defineAiTree(child).tick(context);
      if (last.status !== "success") return last;
    }
    return last;
  },
});

export const condition = (
  predicate: ActionBattleAiCondition
): ActionBattleAiTreeNode => ({
  tick(context) {
    return { status: predicate(context) ? "success" : "failure" };
  },
});

export const action = (
  input: ActionBattleAiIntentInput,
  status: ActionBattleAiTreeStatus = "success"
): ActionBattleAiTreeNode => ({
  tick(context) {
    const result = runIntentInput(input, context);
    return { ...result, status };
  },
});

export const decision = (
  resolve: ActionBattleAiDecision | ((context: ActionBattleAiTreeContext) => ActionBattleAiDecision)
): ActionBattleAiTreeNode => ({
  tick(context) {
    return {
      status: "success",
      decision: typeof resolve === "function" ? resolve(context) : resolve,
    };
  },
});

export const rule = (
  predicate: ActionBattleAiCondition,
  then: ActionBattleAiIntentInput
): ActionBattleAiRule => ({
  condition: predicate,
  then,
});

export const defineAiBehavior = (
  behavior: ActionBattleAiSimpleBehavior
): ActionBattleAiTreeNode => {
  const branches = [
    ...(behavior.when ?? []).map((entry) =>
      sequence([condition(entry.condition), action(entry.then)])
    ),
  ];
  if (behavior.otherwise) {
    branches.push(action(behavior.otherwise));
  }
  return selector(branches);
};

export const hpBelow = (ratio: number): ActionBattleAiCondition => {
  return ({ self }) => self.hpPercent !== null && self.hpPercent < ratio;
};

export const targetVisible = (): ActionBattleAiCondition => {
  return ({ targetInfo }) => Boolean(targetInfo?.visible);
};

export const targetInRange = (
  range?: number
): ActionBattleAiCondition => {
  return ({ self, targetInfo }) => {
    if (!targetInfo) return false;
    return targetInfo.distance <= (range ?? self.attackRange);
  };
};

export const distanceLessThan = (
  distance: number
): ActionBattleAiCondition => {
  return ({ targetInfo }) =>
    targetInfo !== null && targetInfo.distance < distance;
};

export const inState = (state: AiState): ActionBattleAiCondition => {
  return ({ self }) => self.state === state;
};

export const isEnemyType = (
  enemyType: EnemyType
): ActionBattleAiCondition => {
  return ({ self }) => self.enemyType === enemyType;
};

export const idle = (): ActionBattleAiIntent => ({ type: "idle" });
export const patrol = (): ActionBattleAiIntent => ({ type: "patrol" });
export const faceTarget = (): ActionBattleAiIntent => ({ type: "faceTarget" });
export const chase = (): ActionBattleAiIntent => ({ type: "moveToTarget" });
export const moveToTarget = chase;
export const flee = (): ActionBattleAiIntent => ({ type: "fleeFromTarget" });
export const fleeFromTarget = flee;
export const keepDistance = (
  distance: number,
  tolerance?: number
): ActionBattleAiIntent => ({ type: "keepDistance", distance, tolerance });
export const useAttack = (
  pattern?: AttackPattern | string
): ActionBattleAiIntent => ({ type: "useAttack", pattern });
export const useSkill = (skill: any): ActionBattleAiIntent => ({
  type: "useSkill",
  skill,
});
export const setMode = (
  mode: NonNullable<ActionBattleAiDecision["mode"]>
): ActionBattleAiIntent => ({ type: "setMode", mode, consume: false });

export const ifHpBelow = (
  ratio: number,
  then: ActionBattleAiIntentInput
): ActionBattleAiRule => rule(hpBelow(ratio), then);

export const ifTargetVisible = (
  then: ActionBattleAiIntentInput
): ActionBattleAiRule => rule(targetVisible(), then);

export const ifTargetInRange = (
  then: ActionBattleAiIntentInput,
  range?: number
): ActionBattleAiRule => rule(targetInRange(range), then);

export const ifDistanceLessThan = (
  distance: number,
  then: ActionBattleAiIntentInput
): ActionBattleAiRule => rule(distanceLessThan(distance), then);
