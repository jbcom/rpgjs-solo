import type { AnyBlockInstance } from "@common/blocks";
import { defaultBlocks } from "@common/blocks";
import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import { schemaChangeVariable } from "../runtime/blocks/executors/change-variable";
import { blockInstanceSchema } from "../runtime/schemas/block";

const EDITOR_FUNCTION_REFERENCES = Object.freeze({
  commonEvent: true,
  event: true,
  item: true,
  skill: true,
  variable: true,
});

/**
 * Studio uses object-valued `format` entries as form-rendering metadata rather
 * than JSON Schema format assertions. Remove only those editor annotations
 * from the compiled copy; every validation keyword and the canonical source
 * objects remain unchanged.
 */
const withoutEditorFormatMetadata = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(withoutEditorFormatMetadata);
  }
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => {
      if (key === "format" && entry && typeof entry === "object") return [];
      return [[key, withoutEditorFormatMetadata(entry)]];
    }),
  );
};

const ajv = new Ajv({
  allErrors: true,
  coerceTypes: false,
  strict: false,
  useDefaults: false,
  validateFormats: false,
});

const compileSchema = (schema: unknown): ValidateFunction => {
  if (!schema || typeof schema !== "object") {
    throw new Error("Studio block definition is missing a runtime JSON Schema");
  }
  return ajv.compile({
    ...(withoutEditorFormatMetadata(schema) as Record<string, unknown>),
    // Canonical editor references select database records. Their value shape is
    // already constrained by the surrounding property schema.
    functions: EDITOR_FUNCTION_REFERENCES,
  });
};

const blockInstanceValidator = compileSchema(blockInstanceSchema);
const blockDefinitions = [...defaultBlocks, schemaChangeVariable];
const validatorsByType = new Map<string, ValidateFunction>(
  blockDefinitions.map((definition) => [
    definition.type,
    compileSchema(definition.schema),
  ]),
);

export const STUDIO_RUNTIME_BLOCK_SCHEMA_TYPES = Object.freeze(
  Array.from(validatorsByType.keys()).sort(),
);

const summarizeErrors = (errors: ErrorObject[] | null | undefined): string =>
  (errors ?? [])
    .map((error) => `${error.instancePath || "/"} ${error.message ?? error.keyword}`)
    .join(", ");

const validateBlock = (
  value: unknown,
  path: string,
): { valid: true } | { valid: false; reason: string } => {
  if (!blockInstanceValidator(value)) {
    return {
      valid: false,
      reason: `${path} has an invalid block shape: ${summarizeErrors(blockInstanceValidator.errors)}`,
    };
  }

  const block = value as {
    type: string;
    data?: unknown;
    children?: unknown[];
  };
  const validateData = validatorsByType.get(block.type);
  if (!validateData) {
    return { valid: false, reason: `${path} uses unknown block type "${block.type}"` };
  }
  if (!validateData(block.data)) {
    return {
      valid: false,
      reason: `${path}.data is invalid for "${block.type}": ${summarizeErrors(validateData.errors)}`,
    };
  }

  for (const [index, child] of (block.children ?? []).entries()) {
    const result = validateBlock(child, `${path}.children[${index}]`);
    if (!result.valid) return result;
  }

  if (block.type === "show_choices") {
    const data = block.data as { choiceChildren?: unknown };
    if (data.choiceChildren !== undefined) {
      if (!Array.isArray(data.choiceChildren)) {
        return {
          valid: false,
          reason: `${path}.data.choiceChildren must be an array of block arrays`,
        };
      }
      for (const [choiceIndex, choiceBlocks] of data.choiceChildren.entries()) {
        if (!Array.isArray(choiceBlocks)) {
          return {
            valid: false,
            reason: `${path}.data.choiceChildren[${choiceIndex}] must be an array`,
          };
        }
        for (const [blockIndex, choiceBlock] of choiceBlocks.entries()) {
          const result = validateBlock(
            choiceBlock,
            `${path}.data.choiceChildren[${choiceIndex}][${blockIndex}]`,
          );
          if (!result.valid) return result;
        }
      }
    }
  }
  return { valid: true };
};

export const validateStudioBlockSequence = (
  value: unknown,
): { valid: true; blocks: AnyBlockInstance[] } | { valid: false; reason: string } => {
  if (!Array.isArray(value)) {
    return { valid: false, reason: "blocks must be an array" };
  }
  for (const [index, block] of value.entries()) {
    const result = validateBlock(block, `blocks[${index}]`);
    if (!result.valid) return result;
  }
  return { valid: true, blocks: value as AnyBlockInstance[] };
};
