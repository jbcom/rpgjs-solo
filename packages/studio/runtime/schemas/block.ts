import { FromSchema } from "json-schema-to-ts";

export const blockConnectionSchema = {
  type: "object",
  properties: {
    fromBlockId: {
      type: "string",
      title: "From Block ID",
      description: "Source block identifier"
    },
    toBlockId: {
      type: "string", 
      title: "To Block ID",
      description: "Target block identifier"
    },
    outputPort: {
      type: "string",
      title: "Output Port",
      description: "Output port name for conditional blocks (e.g., 'true', 'false', 'choice1')"
    },
    condition: {
      type: "string",
      title: "Condition",
      description: "Condition for the connection"
    }
  },
  required: ["fromBlockId", "toBlockId"]
} as const;

export const blockInstanceSchema = {
  type: "object",
  properties: {
    id: {
      type: "string",
      title: "Block ID",
      description: "Unique identifier for the block"
    },
    type: {
      type: "string",
      title: "Block Type",
      description: "Type of the block (e.g., 'show_message', 'conditional_branch')"
    },
    data: {
      type: "object",
      title: "Block Data",
      description: "Configuration data for the block"
    },
    children: {
      type: "array",
      title: "Child Blocks",
      description: "Nested child blocks",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string" },
          data: { type: "object" },
          parentId: { type: "string" },
          position: {
            type: "object",
            properties: {
              x: { type: "number" },
              y: { type: "number" }
            }
          },
          connections: {
            type: "array",
            items: blockConnectionSchema
          },
          isCollapsed: { type: "boolean" },
          level: { type: "number" }
        },
        required: ["id", "type"]
      }
    },
    parentId: {
      type: "string",
      title: "Parent Block ID",
      description: "ID of the parent block if this is a child"
    },
    position: {
      type: "object",
      title: "Position",
      description: "Visual position of the block",
      properties: {
        x: { type: "number" },
        y: { type: "number" }
      }
    },
    connections: {
      type: "array",
      title: "Connections",
      description: "Connections to other blocks",
      items: blockConnectionSchema
    },
    isCollapsed: {
      type: "boolean",
      title: "Is Collapsed",
      description: "Whether the block is collapsed in the UI"
    },
    level: {
      type: "number",
      title: "Nesting Level",
      description: "Nesting level for visual indentation"
    }
  },
  required: ["id", "type"]
} as const;

export const blockCollectionSchema = {
  type: "object",
  properties: {
    _id: {
      type: "string",
      title: "Collection ID",
      description: "Unique identifier for the block collection"
    },
    projectId: {
      type: "string",
      title: "Project ID",
      description: "ID of the project this collection belongs to"
    },
    blocks: {
      type: "array",
      title: "Blocks",
      description: "Array of block instances",
      items: blockInstanceSchema
    },
    metadata: {
      type: "object",
      title: "Metadata",
      description: "Additional metadata for the collection",
      properties: {
        version: { type: "string" },
        created: { type: "string", format: "date-time" },
        updated: { type: "string", format: "date-time" },
        blockCount: { type: "number" },
        description: { type: "string" }
      }
    },
    createdAt: {
      type: "string",
      format: "date-time",
      title: "Created At",
      description: "Creation timestamp"
    },
    updatedAt: {
      type: "string", 
      format: "date-time",
      title: "Updated At",
      description: "Last update timestamp"
    }
  },
  required: ["projectId", "blocks"]
} as const;

export type BlockConnection = FromSchema<typeof blockConnectionSchema>;
export type BlockInstance = FromSchema<typeof blockInstanceSchema>;
export type BlockCollection = FromSchema<typeof blockCollectionSchema>;
export type BlockCollectionData = BlockCollection & { _id: string };
