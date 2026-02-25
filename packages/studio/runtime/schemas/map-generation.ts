export const mapGenerateSchema = {
  type: "object",
  properties: {
    prompt: { type: "string" },
    tilesetId: { type: "string" },
    terrainId: { type: "string" },
    canvasImage: { type: "string" },
    width: { type: "number" },
    height: { type: "number" },
    name: { type: "string" },
    quality: { type: "string", enum: ["standard"] }
  },
  additionalProperties: false
} as const;

export const mapGenerateExistingSchema = {
  type: "object",
  properties: {
    prompt: { type: "string" },
    tilesetId: { type: "string" },
    canvasImage: { type: "string" },
    quality: { type: "string", enum: ["standard"] }
  },
  required: ["prompt", "tilesetId", "canvasImage"],
  additionalProperties: false
} as const;
