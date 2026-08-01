import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createStudioItemWorkflowHooks,
  normalizeStudioItemWorkflowTriggers,
  type StudioItemWorkflowPhase,
} from "../src/item-workflow";
import {
  configureGameDataProvider,
  resetGameDataProvider,
} from "../src/data-provider";

const workflow = (
  phase: StudioItemWorkflowPhase,
  blocks: Array<Record<string, unknown>>,
) => ({
  phase,
  blockCollectionId: `${phase}-workflow`,
  blocks,
});

const setVariable = (
  variableId: string,
  value: number,
  operation: "set" | "add" = "set",
) => ({
  id: `${operation}-${variableId}-${value}`,
  type: "set_variable",
  data: {
    variableId,
    operation,
    valueSource: "constant",
    value: String(value),
  },
});

const createPlayer = (map: Record<string, unknown> = {}) => {
  const variables = new Map<string, unknown>();
  const player = {
    id: "hero",
    getCurrentMap: () => map,
    getVariable: (id: string) => variables.get(id),
    setVariable: (id: string, value: unknown) => variables.set(id, value),
    syncChanges: vi.fn(),
  };
  return { player, variables };
};

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

describe("Studio item workflows", () => {
  afterEach(() => {
    resetGameDataProvider();
    vi.restoreAllMocks();
  });

  test("normalizes only supported lifecycle hooks with valid references", () => {
    expect(normalizeStudioItemWorkflowTriggers([
      { phase: "onUse", blockCollectionId: " use-workflow " },
      { phase: "onEquip", commonEventId: "equip-event" },
      { phase: "cast", blockCollectionId: "skill-workflow" },
      { phase: "onAdd", blockCollectionId: "" },
    ])).toEqual([
      { phase: "onUse", blockCollectionId: "use-workflow" },
      { phase: "onEquip", commonEventId: "equip-event" },
    ]);
  });

  test("queues native lifecycle hooks in invocation order", async () => {
    const { player, variables } = createPlayer();
    const hooks = createStudioItemWorkflowHooks("potion", [
      workflow("onUse", [setVariable("lifecycle", 1)]),
      workflow("onRemove", [setVariable("lifecycle", 1, "add")]),
    ]);

    const onUse = hooks.onUse?.(player as any);
    const onRemove = hooks.onRemove?.(player as any);
    await Promise.all([onUse, onRemove]);

    expect(variables.get("lifecycle")).toBe(2);
    expect(player.syncChanges).toHaveBeenCalledTimes(2);
  });

  test("exposes the onEquip boolean to custom workflow conditions", async () => {
    const { player, variables } = createPlayer();
    const hooks = createStudioItemWorkflowHooks("iron-sword", [
      workflow("onEquip", [{
        id: "when-equipped",
        type: "conditional_branch",
        data: {
          conditionType: "custom",
          condition: "variables.equip === true",
          children: [setVariable("equipped-workflow", 1)],
        },
      }]),
    ]);

    await hooks.onEquip?.(player as any, true);
    expect(variables.get("equipped-workflow")).toBe(1);

    variables.set("equipped-workflow", 0);
    await hooks.onEquip?.(player as any, false);
    expect(variables.get("equipped-workflow")).toBe(0);
  });

  test("keeps compatibility with Common Event workflow references", async () => {
    const map = {
      __studioCommonEventsById: new Map([
        ["legacy-item-event", {
          triggers: [{
            type: "onAction",
            enabled: true,
            blocks: [setVariable("legacy-item", 1)],
          }],
        }],
      ]),
    };
    const { player, variables } = createPlayer(map);
    const hooks = createStudioItemWorkflowHooks("legacy-item", [{
      phase: "onUse",
      commonEventId: "legacy-item-event",
    }]);

    await hooks.onUse?.(player as any);

    expect(variables.get("legacy-item")).toBe(1);
  });

  test("resolves a referenced current block collection before execution", async () => {
    const getBlockCollection = vi.fn(async (id: string) => ({
      _id: id,
      blocks: [setVariable("resolved-item", 1)],
    }));
    configureBlockCollections(getBlockCollection);
    const { player, variables } = createPlayer();
    const hooks = createStudioItemWorkflowHooks("resolved-item", [{
      phase: "onUse",
      blockCollectionId: "current-item-use",
    }]);

    await hooks.onUse?.(player as any);

    expect(getBlockCollection).toHaveBeenCalledWith("current-item-use");
    expect(variables.get("resolved-item")).toBe(1);
  });

  test("logs a missing referenced block collection without executing twice", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const getBlockCollection = vi.fn(async () => null);
    configureBlockCollections(getBlockCollection);
    const { player, variables } = createPlayer();
    const hooks = createStudioItemWorkflowHooks("missing-item", [{
      phase: "onUse",
      blockCollectionId: "missing-item-use",
    }]);

    await hooks.onUse?.(player as any);

    expect(variables.size).toBe(0);
    expect(getBlockCollection).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(
      '[studio] Item workflow "missing-item-use" failed during onUse',
      expect.objectContaining({
        message: 'Studio block collection "missing-item-use" was not found',
      }),
    );
  });

  test("logs a malformed referenced block collection without partial execution", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const getBlockCollection = vi.fn(async () => ({ blocks: "invalid" }));
    configureBlockCollections(getBlockCollection);
    const { player, variables } = createPlayer();
    const hooks = createStudioItemWorkflowHooks("malformed-item", [{
      phase: "onUse",
      blockCollectionId: "malformed-item-use",
    }]);

    await hooks.onUse?.(player as any);

    expect(variables.size).toBe(0);
    expect(error).toHaveBeenCalledWith(
      '[studio] Item workflow "malformed-item-use" failed during onUse',
      expect.objectContaining({
        message: expect.stringContaining(
          'Studio block collection "malformed-item-use" is malformed',
        ),
      }),
    );
  });

  test("reads an updated block collection on each queued invocation", async () => {
    let revision = 1;
    const getBlockCollection = vi.fn(async () => ({
      blocks: [setVariable("item-revisions", revision++, "add")],
    }));
    configureBlockCollections(getBlockCollection);
    const { player, variables } = createPlayer();
    const hooks = createStudioItemWorkflowHooks("updated-item", [{
      phase: "onUse",
      blockCollectionId: "updated-item-use",
    }]);

    await hooks.onUse?.(player as any);
    await hooks.onUse?.(player as any);

    expect(getBlockCollection).toHaveBeenCalledTimes(2);
    expect(variables.get("item-revisions")).toBe(3);
  });
});
