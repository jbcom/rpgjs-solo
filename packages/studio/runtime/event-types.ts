import { characterSchema } from "./schemas/event";

/**
 * Configuration for event types including their triggers, schemas, and metadata
 */

/**
 * Base trigger types available for all events
 */
export const baseTriggers = [
  {
    type: 'onInit',
    name: 'When Event Initialized',
    description: 'Blocks that execute when the event is first created or loaded',
    icon: 'pi pi-play',
    category: 'lifecycle'
  },
  {
    type: 'onAction',
    name: 'When Action with Player',
    description: 'Blocks that execute when the player interacts with this event',
    icon: 'pi pi-user',
    category: 'interaction'
  },
  {
    type: 'onChange',
    name: 'If a Change Occurs',
    description: 'Blocks that execute when certain conditions or variables change',
    icon: 'pi pi-refresh',
    category: 'condition'
  },
  {
    type: 'onTouch',
    name: 'If Touched by Player',
    description: 'Blocks that execute when the player touches or collides with this event',
    icon: 'pi pi-hand-pointer',
    category: 'interaction'
  }
] as const;

const combatTriggers = [
  {
    type: 'onBattleStart',
    name: 'When Battle Starts',
    description: 'Blocks that execute when combat begins with this enemy',
    icon: 'pi pi-shield',
    category: 'combat'
  },
  {
    type: 'onBattleEnd',
    name: 'When Battle Ends',
    description: 'Blocks that execute when combat ends (victory or defeat)',
    icon: 'pi pi-check',
    category: 'combat'
  },
  {
    type: 'onDefeat',
    name: 'When Defeated',
    description: 'Blocks that execute when this enemy is defeated',
    icon: 'pi pi-times',
    category: 'combat'
  },
  {
    type: 'onAttack',
    name: 'When Attacking',
    description: 'Blocks that execute when this enemy attacks',
    icon: 'pi pi-send',
    category: 'combat'
  }
] as const;

/**
 * Character-specific schema
 */
export const characterEventSchema = {
  type: "object",
  properties: {
    ...characterSchema,
    dialogues: {
      type: "array",
      title: "Dialogues",
      description: "Character dialogue lines",
      items: {
        type: "object",
        properties: {
          text: {
            type: "string",
            title: "Dialogue Text"
          },
          emotion: {
            type: "string",
            title: "Emotion",
            enum: ["neutral", "happy", "sad", "angry", "surprised"],
            enumNames: ["Neutral", "Happy", "Sad", "Angry", "Surprised"]
          }
        }
      }
    },
    characterType: {
      type: "string",
      title: "Character Type",
      enum: ["npc", "merchant", "quest_giver", "guard"],
      enumNames: ["NPC", "Merchant", "Quest Giver", "Guard"],
      default: "npc"
    }
  }
} as const;

/**
 * Enemy-specific schema
 */
export const monsterEventSchema = {
  type: "object",
  properties: {
    ...characterSchema,
    stats: {
      type: "object",
      title: "Enemy Stats",
      properties: {
        level: {
          type: "number",
          title: "Level",
          minimum: 1,
          maximum: 100,
          default: 1
        },
        health: {
          type: "number",
          title: "Health Points",
          minimum: 1,
          default: 100
        },
        attack: {
          type: "number",
          title: "Attack Power",
          minimum: 1,
          default: 10
        },
        defense: {
          type: "number",
          title: "Defense",
          minimum: 0,
          default: 5
        },
        speed: {
          type: "number",
          title: "Speed",
          minimum: 1,
          default: 10
        }
      }
    },
    loot: {
      type: "array",
      title: "Loot Table",
      description: "Items that can be dropped when defeated",
      items: {
        type: "object",
        properties: {
          itemId: {
            type: "string",
            title: "Item ID"
          },
          dropRate: {
            type: "number",
            title: "Drop Rate (%)",
            minimum: 0,
            maximum: 100,
            default: 50
          }
        }
      }
    },
    monsterType: {
      type: "string",
      title: "Enemy Type",
      enum: ["beast", "undead", "demon", "elemental", "humanoid"],
      enumNames: ["Beast", "Undead", "Demon", "Elemental", "Humanoid"],
      default: "beast"
    }
  }
} as const;

/**
 * Free/Custom event schema
 */
export const freeEventSchema = {
  type: "object",
  properties: {
    customProperties: {
      type: "object",
      title: "Custom Properties",
      description: "Define your own custom properties for this event",
      additionalProperties: true
    },
    eventCategory: {
      type: "string",
      title: "Event Category",
      enum: ["interactive", "decoration", "trigger", "teleport", "save_point", "treasure"],
      enumNames: ["Interactive", "Decoration", "Trigger", "Teleport", "Save Point", "Treasure"],
      default: "interactive"
    }
  }
} as const;

/**
 * Chest-specific schema
 */
export const chestEventSchema = {
  type: "object",
  properties: {
    locked: {
      type: "boolean",
      title: "Locked",
      description: "Requires a key or condition to open",
      default: false
    },
    openedSwitch: {
      type: "string",
      title: "Opened Switch",
      description: "Optional switch to mark the chest as opened"
    }
  }
} as const;

/**
 * Event type configuration
 */
export const eventTypesConfig = {
  character: {
    label: 'Character',
    description: 'A talking character that can interact with the player',
    icon: 'pi pi-user',
    color: '#3b82f6',
    schema: characterEventSchema,
    triggers: [
      ...baseTriggers,
    ]
  },
  enemy: {
    label: 'Enemy',
    description: 'An enemy that can engage in combat with the player',
    icon: 'pi pi-bolt',
    color: '#ef4444',
    schema: monsterEventSchema,
    triggers: [
      ...baseTriggers,
      ...combatTriggers
    ]
  },

  free: {
    label: 'Free (From Scratch)',
    description: 'A custom event that you can build from scratch',
    icon: 'pi pi-cog',
    color: '#8b5cf6',
    schema: freeEventSchema,
    triggers: [
      ...baseTriggers,
      // Free event can have any custom triggers
      {
        type: 'onCustom1',
        name: 'Custom Trigger 1',
        description: 'A custom trigger that you can define for your specific needs',
        icon: 'pi pi-star',
        category: 'custom'
      },
      {
        type: 'onCustom2',
        name: 'Custom Trigger 2',
        description: 'Another custom trigger for complex event logic',
        icon: 'pi pi-star-fill',
        category: 'custom'
      }
    ]
  },

  // chest: {
  //   label: 'Chest',
  //   description: 'A container that rewards the player when opened',
  //   icon: 'pi pi-box',
  //   color: '#f59e0b',
  //   schema: chestEventSchema,
  //   triggers: [
  //     {
  //       type: 'onAction',
  //       name: 'After Opened',
  //       description: 'Blocks that run when the chest is opened',
  //       icon: 'pi pi-unlock',
  //       category: 'interaction'
  //     },
  //     {
  //       type: 'onInit',
  //       name: 'Already Opened',
  //       description: 'Blocks that run when the chest has already been opened',
  //       icon: 'pi pi-check',
  //       category: 'state'
  //     }
  //   ]
  // }
} as const;

/**
 * Type definitions for the event configuration
 */
export type EventType = keyof typeof eventTypesConfig;
export type EventTypeConfig = typeof eventTypesConfig[EventType];
export type BaseTrigger = typeof baseTriggers[number];
export type EventTrigger = BaseTrigger | EventTypeConfig['triggers'][number];

/**
 * Utility functions for working with event types
 */
export const EventTypeUtils = {
  /**
   * Get configuration for a specific event type
   */
  getConfig(eventType: EventType): EventTypeConfig {
    return eventTypesConfig[eventType];
  },

  /**
   * Get all available event types
   */
  getAllTypes(): EventType[] {
    return Object.keys(eventTypesConfig) as EventType[];
  },

  /**
   * Get triggers for a specific event type
   */
  getTriggersForType(eventType: EventType): EventTrigger[] {
    return [...eventTypesConfig[eventType].triggers];
  },

  /**
   * Get schema for a specific event type
   */
  getSchemaForType(eventType: EventType) {
    return eventTypesConfig[eventType].schema;
  },

  /**
   * Check if a trigger type is valid for an event type
   */
  isTriggerValidForEventType(eventType: EventType, triggerType: string): boolean {
    const triggers = this.getTriggersForType(eventType);
    return triggers.some(trigger => trigger.type === triggerType);
  },

  /**
   * Get trigger configuration by type and event type
   */
  getTriggerConfig(eventType: EventType, triggerType: string): EventTrigger | undefined {
    const triggers = this.getTriggersForType(eventType);
    return triggers.find(trigger => trigger.type === triggerType);
  }
};

export const isEventType = (eventType: string): eventType is EventType => {
  return eventType in eventTypesConfig;
};

export const normalizeEventType = (eventType?: string): EventType | null => {
  if (!eventType) return 'character';
  if (eventType === 'ennemy') return 'enemy';
  if (eventType === 'monster') return 'enemy';
  if (isEventType(eventType)) return eventType;
  return null;
};
