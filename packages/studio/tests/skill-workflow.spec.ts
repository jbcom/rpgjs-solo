import { afterEach, describe, expect, test, vi } from "vitest";
import { createStudioSkillOnUse } from "../src/skill-workflow";
import {
  configureGameDataProvider,
  resetGameDataProvider,
} from "../src/data-provider";

const workflow = (phase: "cast" | "impact" | "defeat", variableId: string) => ({
  phase,
  blockCollectionId: `${phase}-workflow`,
  blocks: [{
      id: `set-${variableId}`,
      type: "set_variable",
      data: {
        variableId,
        operation: "set",
        value: 1,
      },
    }],
});

const commonEvent = (variableId: string) => ({
  triggers: [{
    type: "onAction",
    enabled: true,
    blocks: workflow("impact", variableId).blocks,
  }],
});

const configureBlockCollections = (
  getBlockCollection: (id: string) => Promise<unknown>,
) => {
  configureGameDataProvider({
    kind: "online",
    getProject: async () => ({}),
    getMap: async () => ({}),
    getMedia: async () => ({}),
    getDatabase: async () => [],
    getBlockCollection,
  });
};

const createWorkflowPlayer = () => {
  const variables = new Map<string, unknown>();
  const player = {
    id: "hero",
    getCurrentMap: () => ({}),
    getVariable: (id: string) => variables.get(id),
    setVariable: (id: string, value: unknown) => variables.set(id, value),
    syncChanges: vi.fn(),
  };
  return { player, variables };
};

describe("Studio skill workflows", () => {
  afterEach(() => {
    resetGameDataProvider();
    vi.restoreAllMocks();
  });

  test("runs cast, impact and defeat workflows from the native onUse hook", async () => {
    const variables = new Map<string, unknown>();
    const map = {};
    const player = {
      id: "hero",
      getCurrentMap: () => map,
      getVariable: (id: string) => variables.get(id),
      setVariable: (id: string, value: unknown) => variables.set(id, value),
      syncChanges: vi.fn(),
    };
    const target = {
      id: "slime",
      hp: 0,
      isEvent: () => true,
      getCurrentMap: () => map,
    };
    const defaultEffect = vi.fn(() => [{ defeated: true }]);
    const onUse = createStudioSkillOnUse("fire", [
      workflow("cast", "cast"),
      workflow("impact", "impact"),
      workflow("defeat", "defeat"),
    ]);

    await onUse?.(player as any, target, {
      action: { mode: "melee" },
      defaultEffect,
      projectile: vi.fn(),
    });

    expect(defaultEffect).toHaveBeenCalledOnce();
    expect(Object.fromEntries(variables)).toEqual({
      cast: 1,
      impact: 1,
      defeat: 1,
    });
  });

  test("keeps projectile damage deferred until impact", async () => {
    const map = {};
    const variables = new Map<string, unknown>();
    const player = {
      id: "hero",
      getCurrentMap: () => map,
      getVariable: (id: string) => variables.get(id),
      setVariable: (id: string, value: unknown) => variables.set(id, value),
      syncChanges: vi.fn(),
    };
    const target = { id: "slime", hp: 5, isEvent: () => true };
    const defaultEffect = vi.fn(() => [{ defeated: false }]);
    let projectileOptions: Record<string, unknown> | undefined;
    const onUse = createStudioSkillOnUse("fireball", [
      workflow("impact", "impact"),
    ]);

    await onUse?.(player as any, target, {
      action: {
        mode: "projectile",
        projectile: { speed: 240 },
      },
      defaultEffect,
      projectile: (options) => {
        projectileOptions = options;
      },
    });

    expect(defaultEffect).not.toHaveBeenCalled();
    expect(projectileOptions).toMatchObject({ speed: 240 });

    const onImpact = projectileOptions?.["onImpact"];
    expect(onImpact).toBeTypeOf("function");
    (onImpact as Function)({ target }, { defaultEffect });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(defaultEffect).toHaveBeenCalledWith(target);
    expect(variables.get("impact")).toBe(1);
  });

  test("keeps compatibility with Common Event workflow references", async () => {
    const variables = new Map<string, unknown>();
    const map = {
      __studioCommonEventsById: new Map([
        ["legacy-impact-event", commonEvent("legacy-impact")],
      ]),
    };
    const player = {
      id: "hero",
      getCurrentMap: () => map,
      getVariable: (id: string) => variables.get(id),
      setVariable: (id: string, value: unknown) => variables.set(id, value),
      syncChanges: vi.fn(),
    };
    const target = { id: "slime", hp: 5, isEvent: () => true };
    const onUse = createStudioSkillOnUse("legacy-fire", [{
      phase: "impact",
      commonEventId: "legacy-impact-event",
    }]);

    await onUse?.(player as any, target, {
      action: { mode: "melee" },
      defaultEffect: () => [{ defeated: false }],
      projectile: vi.fn(),
    });

    expect(variables.get("legacy-impact")).toBe(1);
  });

  test("resolves a referenced current block collection before execution", async () => {
    const getBlockCollection = vi.fn(async (id: string) => ({
      _id: id,
      blocks: workflow("cast", "resolved-cast").blocks,
    }));
    configureBlockCollections(getBlockCollection);
    const { player, variables } = createWorkflowPlayer();
    const onUse = createStudioSkillOnUse("resolved-skill", [{
      phase: "cast",
      blockCollectionId: "current-cast",
    }]);

    await onUse?.(player as any);

    expect(getBlockCollection).toHaveBeenCalledWith("current-cast");
    expect(variables.get("resolved-cast")).toBe(1);
  });

  test("logs a missing referenced block collection without executing twice", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const getBlockCollection = vi.fn(async () => null);
    configureBlockCollections(getBlockCollection);
    const { player, variables } = createWorkflowPlayer();
    const onUse = createStudioSkillOnUse("missing-skill", [{
      phase: "cast",
      blockCollectionId: "missing-cast",
    }]);

    await onUse?.(player as any);

    expect(variables.size).toBe(0);
    expect(getBlockCollection).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(
      '[studio] Skill workflow "missing-cast" failed during cast',
      expect.objectContaining({
        message: 'Studio block collection "missing-cast" was not found',
      }),
    );
  });

  test("logs a malformed referenced block collection without partial execution", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const getBlockCollection = vi.fn(async () => ({
      blocks: [{ id: "missing-type" }],
    }));
    configureBlockCollections(getBlockCollection);
    const { player, variables } = createWorkflowPlayer();
    const onUse = createStudioSkillOnUse("malformed-skill", [{
      phase: "cast",
      blockCollectionId: "malformed-cast",
    }]);

    await onUse?.(player as any);

    expect(variables.size).toBe(0);
    expect(error).toHaveBeenCalledWith(
      '[studio] Skill workflow "malformed-cast" failed during cast',
      expect.objectContaining({
        message: 'Studio block collection "malformed-cast" is malformed',
      }),
    );
  });

  test("reads an updated block collection on each queued invocation", async () => {
    let revision = 1;
    const getBlockCollection = vi.fn(async () => ({
      blocks: [{
        id: `add-skill-revision-${revision}`,
        type: "set_variable",
        data: {
          variableId: "skill-revisions",
          operation: "add",
          value: revision++,
        },
      }],
    }));
    configureBlockCollections(getBlockCollection);
    const { player, variables } = createWorkflowPlayer();
    const onUse = createStudioSkillOnUse("updated-skill", [{
      phase: "cast",
      blockCollectionId: "updated-cast",
    }]);

    await onUse?.(player as any);
    await onUse?.(player as any);

    expect(getBlockCollection).toHaveBeenCalledTimes(2);
    expect(variables.get("skill-revisions")).toBe(3);
  });
});
