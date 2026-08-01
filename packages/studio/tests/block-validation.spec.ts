import { describe, expect, test } from "vitest";
import { defaultBlocks } from "../runtime/blocks";
import { schemaChangeVariable } from "../runtime/blocks/executors/change-variable";
import {
  STUDIO_RUNTIME_BLOCK_SCHEMA_TYPES,
  validateStudioBlockSequence,
} from "../src/block-validation";

const validSetVariable = () => ({
  id: "set-score",
  type: "set_variable",
  data: {
    variableId: "score",
    operation: "set",
    valueSource: "constant",
    value: "1",
  },
});

describe("Studio runtime block validation", () => {
  test("compiles every canonical runtime block schema exactly once", () => {
    const canonicalTypes = [...defaultBlocks, schemaChangeVariable]
      .map((definition) => definition.type)
      .sort();

    expect(STUDIO_RUNTIME_BLOCK_SCHEMA_TYPES).toEqual(canonicalTypes);
    expect(new Set(STUDIO_RUNTIME_BLOCK_SCHEMA_TYPES).size).toBe(
      STUDIO_RUNTIME_BLOCK_SCHEMA_TYPES.length,
    );
  });

  test("accepts empty collections and valid canonical block data without mutation", () => {
    expect(validateStudioBlockSequence([])).toEqual({ valid: true, blocks: [] });
    const blocks = [validSetVariable()];
    const before = structuredClone(blocks);

    expect(validateStudioBlockSequence(blocks)).toEqual({
      valid: true,
      blocks,
    });
    expect(blocks).toEqual(before);
  });

  test("compiles clones without mutating canonical editor schema metadata", () => {
    const setVariable = defaultBlocks.find(
      (definition) => definition.type === "set_variable",
    );
    const variableId = (setVariable?.schema as any)?.properties?.variableId;

    expect(variableId).toMatchObject({
      type: "string",
      $ref: "#/functions/variable",
      format: expect.any(Object),
    });
    expect(setVariable?.schema).not.toHaveProperty("functions");
  });

  test.each([
    {
      name: "unknown types",
      blocks: [{ id: "unknown", type: "not_a_runtime_block", data: {} }],
      reason: "unknown block type",
    },
    {
      name: "missing required block data",
      blocks: [{ id: "missing-data", type: "set_variable" }],
      reason: ".data is invalid",
    },
    {
      name: "missing conditional data requirements",
      blocks: [{
        id: "missing-value",
        type: "set_variable",
        data: { variableId: "score", valueSource: "constant" },
      }],
      reason: "must have required property 'value'",
    },
    {
      name: "invalid data property types",
      blocks: [{
        id: "bad-variable",
        type: "set_variable",
        data: {
          variableId: 42,
          valueSource: "constant",
          value: "1",
        },
      }],
      reason: "must be string",
    },
    {
      name: "malformed children",
      blocks: [{ ...validSetVariable(), children: {} }],
      reason: "invalid block shape",
    },
    {
      name: "unknown nested block types",
      blocks: [{
        id: "branch",
        type: "conditional_branch",
        data: {
          conditionType: "switch",
          switchId: "door-open",
          switchValue: true,
        },
        children: [{ id: "nested", type: "unknown_nested", data: {} }],
      }],
      reason: "blocks[0].children[0] uses unknown block type",
    },
  ])("rejects $name", ({ blocks, reason }) => {
    expect(validateStudioBlockSequence(blocks)).toMatchObject({
      valid: false,
      reason: expect.stringContaining(reason),
    });
  });
});
