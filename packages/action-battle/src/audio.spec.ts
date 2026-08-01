import { describe, expect, it, vi } from "vitest";
import {
  ACTION_BATTLE_COMBAT_AUDIO_ID,
  createActionBattleCombatAudioVisual,
  playActionBattleMomentAudio,
  updateActionBattleThreat,
} from "./audio";

describe("action battle audio", () => {
  it("prefers the skill sound over the generic skill cue", () => {
    const engine = { playSound: vi.fn() };
    playActionBattleMomentAudio(
      engine,
      { skill: "generic-cast" },
      { moment: "castSkill", skill: { sound: "fire-cast" } },
    );

    expect(engine.playSound).toHaveBeenCalledWith("fire-cast", { volume: 1 });
  });

  it("layers impact and reaction cues, using defeat instead of hurt on lethal hits", () => {
    const engine = { playSound: vi.fn() };
    playActionBattleMomentAudio(
      engine,
      { hit: "impact", hurt: "grunt", die: "death" },
      { moment: "hurt", result: { defeated: true } },
    );

    expect(engine.playSound).toHaveBeenCalledWith("impact", { volume: 1 });
    expect(engine.playSound).toHaveBeenCalledWith("death", { volume: 1 });
    expect(engine.playSound).not.toHaveBeenCalledWith("grunt", expect.anything());
  });

  it("keeps threat snapshots isolated per player", () => {
    const playerA = { clientVisual: vi.fn() };
    const playerB = { clientVisual: vi.fn() };
    const enemyA = {};
    const enemyB = {};

    updateActionBattleThreat(enemyA, playerA, true, {
      enemyId: "slime",
      music: "slime-theme",
    });
    updateActionBattleThreat(enemyB, playerB, true, {
      enemyId: "boss",
      music: "boss-theme",
      boss: true,
    });

    expect(playerA.clientVisual).toHaveBeenLastCalledWith(
      ACTION_BATTLE_COMBAT_AUDIO_ID,
      { threats: [expect.objectContaining({ enemyId: "slime" })] },
    );
    expect(playerB.clientVisual).toHaveBeenLastCalledWith(
      ACTION_BATTLE_COMBAT_AUDIO_ID,
      { threats: [expect.objectContaining({ enemyId: "boss", priority: 100 })] },
    );
  });

  it("selects enemy, map, then project music and keeps the current source on ties", () => {
    const music = {
      enter: vi.fn(),
      leave: vi.fn(),
      contextId: "wolf",
    };
    const handler = createActionBattleCombatAudioVisual({
      music: { battle: "project-theme" },
    });
    handler({
      engine: {
        music,
        sceneMap: {
          data: () => ({ params: { combatMusic: "map-theme" } }),
        },
      },
      data: {
        threats: [
          { enemyId: "bat", priority: 0, order: 1 },
          { enemyId: "wolf", music: "wolf-theme", priority: 0, order: 2 },
        ],
      },
    });

    expect(music.enter).toHaveBeenCalledWith(
      "wolf-theme",
      expect.objectContaining({ battle: "project-theme" }),
      expect.any(Object),
    );
    expect(music.contextId).toBe("wolf");
  });

  it("preserves map music when combat has no resolvable battle track", () => {
    const music = {
      enter: vi.fn(),
      leave: vi.fn(),
      contextId: undefined as string | undefined,
    };
    const handler = createActionBattleCombatAudioVisual({
      music: {
        battle: () => undefined,
      },
    });

    const engine = {
      music,
      sceneMap: {
        data: () => ({ params: {} }),
      },
    };

    handler({
      engine,
      data: {
        threats: [
          { enemyId: "wolf", priority: 0, order: 1 },
        ],
      },
    });

    expect(music.enter).not.toHaveBeenCalled();
    expect(music.leave).not.toHaveBeenCalled();
    expect(music.contextId).toBe("wolf");

    handler({ engine, data: { threats: [] } });

    expect(music.enter).not.toHaveBeenCalled();
    expect(music.leave).not.toHaveBeenCalled();
    expect(music.contextId).toBeUndefined();
  });

  it("restores map music when the remaining threat has no battle track", () => {
    const music = {
      enter: vi.fn(),
      leave: vi.fn(),
      contextId: undefined as string | undefined,
    };
    const handler = createActionBattleCombatAudioVisual({
      music: {
        battle: () => undefined,
      },
    });
    const engine = {
      music,
      sceneMap: {
        data: () => ({ params: {} }),
      },
    };

    handler({
      engine,
      data: {
        threats: [
          {
            enemyId: "warden",
            music: "warden-theme",
            priority: 100,
            order: 1,
          },
        ],
      },
    });
    handler({
      engine,
      data: {
        threats: [
          { enemyId: "wolf", priority: 0, order: 2 },
        ],
      },
    });

    expect(music.enter).toHaveBeenCalledOnce();
    expect(music.enter).toHaveBeenCalledWith(
      "warden-theme",
      expect.objectContaining({ battle: expect.any(Function) }),
      expect.any(Object),
    );
    expect(music.leave).toHaveBeenCalledOnce();
    expect(music.leave).toHaveBeenCalledWith(
      expect.objectContaining({ battle: expect.any(Function) }),
      music.enter.mock.calls[0]?.[2],
    );
    expect(music.contextId).toBe("wolf");

    handler({ engine, data: { threats: [] } });

    expect(music.leave).toHaveBeenCalledOnce();
    expect(music.contextId).toBeUndefined();
  });

  it("restores map music once when the final tracked threat exits", () => {
    const music = {
      enter: vi.fn(),
      leave: vi.fn(),
      contextId: undefined as string | undefined,
    };
    const handler = createActionBattleCombatAudioVisual({
      music: { battle: "encounter-theme" },
    });
    const engine = {
      music,
      sceneMap: {
        data: () => ({ params: {} }),
      },
    };

    handler({
      engine,
      data: {
        threats: [
          { enemyId: "wolf", priority: 0, order: 1 },
        ],
      },
    });
    handler({ engine, data: { threats: [] } });
    handler({ engine, data: { threats: [] } });

    expect(music.enter).toHaveBeenCalledOnce();
    expect(music.leave).toHaveBeenCalledOnce();
    expect(music.leave).toHaveBeenCalledWith(
      expect.objectContaining({ battle: "encounter-theme" }),
      music.enter.mock.calls[0]?.[2],
    );
    expect(music.contextId).toBeUndefined();
  });

  it("returns a rejected music transition to the client visual registry", async () => {
    const failure = new Error("battle music unavailable");
    const music = {
      enter: vi.fn(() => Promise.reject(failure)),
      leave: vi.fn(),
      contextId: undefined as string | undefined,
    };
    const handler = createActionBattleCombatAudioVisual({
      music: { battle: "encounter-theme" },
    });

    const transition = handler({
      engine: {
        music,
        sceneMap: {
          data: () => ({ params: {} }),
        },
      },
      data: {
        threats: [
          { enemyId: "wolf", priority: 0, order: 1 },
        ],
      },
    });

    await expect(transition).rejects.toBe(failure);
  });
});
