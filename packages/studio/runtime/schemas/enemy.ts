import { FromSchema } from "json-schema-to-ts";
import { createAppearanceSchema, inventorySchemas, parameterSchemas } from "./character-config";
import { itemSchema } from "./database";
import { characterSchema } from "./event";

export const enemyRewardSchema = {
  type: "object",
  title: "Reward",
  format: {
    layout: "reward",
  } as any,
  properties: {
    exp: {
      type: "number",
      title: "Experience",
      minimum: 0,
      default: 0,
    },
    gold: {
      type: "number",
      title: "Gold",
      minimum: 0,
      default: 0,
    },
    items: {
      type: "array",
      title: "Items",
      items: {
        type: "object",
        properties: {
          itemId: {
            type: "string",
            title: "Item",
            $ref: "#/functions/item",
            format: {
              add: {
                schema: itemSchema,
              },
            } as any,
          },
          amount: {
            type: "number",
            title: "Amount",
            minimum: 1,
            default: 1,
          },
          chance: {
            type: "number",
            title: "Chance",
            minimum: 0,
            maximum: 100,
            default: 100,
          },
        },
        required: ["itemId", "amount", "chance"],
      },
    },
  },
} as const;

export const enemySchema = {
  type: "object",
  properties: {
    name: {
      type: "string",
      title: "Name",
      format: { layout: "basic" },
    },
    ...characterSchema,
    ...parameterSchemas,
    ...inventorySchemas,
    reward: enemyRewardSchema,
  },
  required: ["name"],
} as any;

export type Enemy = FromSchema<typeof enemySchema>;
export type EnemyData = Enemy & { _id: string };
