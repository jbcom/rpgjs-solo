import { describe, expect, test } from "vitest";
import {
  captureActionBattleActorGeneration,
  initializeActionBattleActorLife,
  isActionBattleActorGenerationCurrent,
} from "./actor-life";

describe("actor life generations", () => {
  test("invalidates work across an unobserved defeat-revival transition", () => {
    const actor = { id: "actor", hp: 10 } as any;
    initializeActionBattleActorLife(actor);
    const stale = captureActionBattleActorGeneration(actor);

    actor.hp = 0;
    actor.hp = 10;

    expect(isActionBattleActorGenerationCurrent(actor, stale)).toBe(false);
    const revived = captureActionBattleActorGeneration(actor);
    expect(isActionBattleActorGenerationCurrent(actor, revived)).toBe(true);
    expect(revived.life).toBe(stale.life + 2);
  });
});
