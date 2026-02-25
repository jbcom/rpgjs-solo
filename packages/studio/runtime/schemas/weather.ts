import { WEATHER_EFFECTS, WEATHER_PRESET_NAMES } from "../weather";

const weatherEffectEnum = [...WEATHER_EFFECTS];
const weatherPresetEnum = ["custom", ...WEATHER_PRESET_NAMES];
const weatherEffectLabels = ["Rain", "Snow", "Fog", "Clouds"];
const weatherPresetLabelByValue: Record<string, string> = {
  custom: "Custom",
  lightRain: "Light Rain",
  steadyRain: "Steady Rain",
  stormRain: "Storm Rain",
  lightSnow: "Light Snow",
  winterSnow: "Winter Snow",
  blizzardSnow: "Blizzard Snow",
  rpgMorningMist: "RPG Morning Mist",
  rpgForestFog: "RPG Forest Fog",
  rpgSwampFog: "RPG Swamp Fog",
  rpgNightFog: "RPG Night Fog",
  rpgHeavyFog: "RPG Heavy Fog",
  lightClouds: "Light Clouds",
  overcastClouds: "Overcast Clouds",
  stormClouds: "Storm Clouds",
  goldenHourRays: "Golden Hour Rays",
  sunnySoftRays: "Sunny Soft Rays",
  sunsetTwinkleRays: "Sunset Twinkle Rays",
  dramaticCrepuscularRays: "Dramatic Crepuscular Rays",
  morningHazeRays: "Morning Haze Rays",
};
const weatherPresetLabels = weatherPresetEnum.map((value) => weatherPresetLabelByValue[value] ?? value);

export const weatherParamsProperties = {
  density: {
    type: "number",
    title: "Density",
    description: "How heavy the effect looks. Higher value = more rain, snow, fog, or clouds.",
  },
  speed: {
    type: "number",
    title: "Speed",
    description: "How fast particles move on screen.",
  },
  windDirection: {
    type: "number",
    title: "Wind Direction",
    description: "Direction of the wind in degrees. Use 0 for default direction.",
  },
  windStrength: {
    type: "number",
    title: "Wind Strength",
    description: "How strongly wind pushes particles sideways.",
  },
  maxDrops: {
    type: "number",
    title: "Max Drops/Flakes",
    description: "Maximum number of visible particles at once.",
  },
  scale: {
    type: "number",
    title: "Scale",
    description: "Visual size of the particles (drops, flakes, fog blobs, clouds).",
  },
  height: {
    type: "number",
    title: "Height",
    description: "Vertical coverage of fog/cloud layers on the screen.",
  },
  opacity: {
    type: "number",
    title: "Opacity",
    description: "Transparency of the effect. Lower value = more transparent.",
  },
  sunIntensity: {
    type: "number",
    title: "Sun Intensity",
    description: "Brightness level for cloud-style lighting. Useful for overcast ambiance.",
  },
  sunAngle: {
    type: "number",
    title: "Sun Angle",
    description: "Direction angle of sun rays in cloud presets.",
  },
  raySpread: {
    type: "number",
    title: "Ray Spread",
    description: "How wide sun rays are spread across the sky.",
  },
  rayTwinkle: {
    type: "number",
    title: "Ray Twinkle",
    description: "How much rays flicker over time.",
  },
  rayTwinkleSpeed: {
    type: "number",
    title: "Ray Twinkle Speed",
    description: "How fast ray flicker animation changes.",
  },
} as const;

export const weatherParamsSchema = {
  type: "object",
  title: "Parameters",
  description: "Fine-tune how the selected weather effect behaves visually.",
  properties: weatherParamsProperties,
} as const;

export const weatherStateProperties = {
  effect: {
    type: "string",
    title: "Effect",
    description: "Main weather type to display on the map.",
    enum: weatherEffectEnum,
    format: {
      labels: weatherEffectLabels,
    },
  },
  preset: {
    type: "string",
    title: "Preset",
    description: "Quick starting style. Pick a preset, then tweak values manually if needed.",
    enum: weatherPresetEnum,
    default: "custom",
    format: {
      labels: weatherPresetLabels,
    },
  },
  params: weatherParamsSchema,
} as const;

export const weatherStateSchema = {
  type: "object",
  properties: {
    preset: weatherStateProperties.preset,
  },
  required: ["preset"],
  allOf: [
    {
      if: {
        properties: {
          preset: { const: "custom" },
        },
      },
      then: {
        properties: {
          effect: weatherStateProperties.effect,
          params: weatherStateProperties.params,
        },
        required: ["effect"],
      },
    },
  ],
} as const;

export const weatherStateNullableSchema = {
  ...weatherStateSchema,
  type: ["object", "null"],
  title: "Weather",
  description: "Optional weather state for the map",
} as const;

export const weatherSetBlockSchema = {
  type: "object",
  properties: {
    preset: weatherStateProperties.preset,
  },
  required: ["preset"],
  allOf: [
    {
      if: {
        properties: {
          preset: { const: "custom" },
        },
      },
      then: {
        properties: {
          effect: {
            ...weatherStateProperties.effect,
            default: "rain",
          },
          params: weatherStateProperties.params,
        },
        required: ["effect"],
      },
    },
  ],
} as const;

export const weatherPatchBlockSchema = {
  type: "object",
  properties: {
    preset: weatherStateProperties.preset,
  },
  allOf: [
    {
      if: {
        properties: {
          preset: { const: "custom" },
        },
      },
      then: {
        properties: {
          effect: weatherStateProperties.effect,
          params: {
            ...weatherStateProperties.params,
            title: "Parameters patch",
          },
        },
        anyOf: [{ required: ["effect"] }, { required: ["params"] }],
      },
      else: {
        required: ["preset"],
      },
    },
  ],
} as const;
