import { FromSchema } from "json-schema-to-ts";

/**
 * Character Schema
 * 
 * Defines the structure for characters and their animations in the RPG Studio.
 * Characters can be of different types (character, monster, object) and have
 * multiple animations with associated media and prompts.
 * 
 * @example
 * ```typescript
 * const character: Character = {
 *   id: 'char_123',
 *   name: 'Hero Knight',
 *   description: 'A brave knight with shining armor',
 *   type: 'character',
 *   faceset: 'faceset_456',
 *   animations: [
 *     {
 *       id: 'anim_789',
 *       name: 'idle',
 *       mediaId: 'media_123',
 *       prompt: 'A knight standing idle with subtle breathing animation'
 *     }
 *   ],
 *   createdAt: new Date(),
 *   updatedAt: new Date()
 * };
 * ```
 */

export const characterSchema = {
  type: "object",
  properties: {
    id: {
      type: "string",
      title: "ID",
    },
    name: {
      type: "string",
      title: "Name",
    },
    description: {
      type: "string",
      title: "Description",
      format: "textarea",
    },
    type: {
      type: "string",
      title: "Type",
      enum: ["character", "monster", "object", "animations"],
    },
    faceset: {
      type: "string",
      title: "Faceset",
      description: "Associated faceset media ID for character portraits",
    },
    animations: {
      type: "array",
      title: "Animations",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          mediaId: { type: "string" },
          prompt: { type: "string" },
          description: { type: "string" },
          speed: { type: "number" },
          loop: { type: "boolean" },
        },
        required: ["id", "name", "mediaId", "prompt"],
      },
    },
    createdAt: {
      type: "string",
      format: "date-time",
    },
    updatedAt: {
      type: "string",
      format: "date-time",
    },
    projectId: {
      type: "string",
    },
    userId: {
      type: "string",
    },
  },
  required: ["id", "name", "description", "type", "animations", "createdAt", "updatedAt", "projectId", "userId"],
} as const;

export interface Character {
  /** Unique identifier for the character */
  _id: string;
  
  /** Display name of the character */
  name: string;
  
  /** Description of the character */
  description: string;
  
  /** Type of character: character, monster, object, or animations */
  type: 'character' | 'monster' | 'object' | 'animations';
  
  /** Associated faceset media ID for character portraits */
  faceset?: string;
  
  /** Array of animations for this character */
  animations: CharacterAnimation[];
  
  /** Creation timestamp */
  createdAt: Date;
  
  /** Last modification timestamp */
  updatedAt: Date;
  
  /** Project ID this character belongs to */
  projectId: string;
  
  /** User ID who created this character */
  userId: string;
}

/**
 * Character Animation
 * 
 * Represents an animation sequence for a character with associated media and prompt.
 * 
 * @example
 * ```typescript
 * const animation: CharacterAnimation = {
 *   id: 'anim_789',
 *   name: 'idle',
 *   mediaId: 'media_123',
 *   prompt: 'A knight standing idle with subtle breathing animation'
 * };
 * ```
 */
export interface CharacterAnimation {
  id: string;
  /** Name of the animation (e.g., 'idle', 'walk', 'attack') */
  name: string;
  
  /** Associated media ID containing the animation frames */
  mediaId: string;
  
  /** AI prompt used to generate this animation */
  prompt: string;
  
  /** Optional description of the animation */
  description?: string;
}

/**
 * Animation creation data
 * 
 * Used when creating new animations for a character.
 * 
 * @example
 * ```typescript
 * const createAnimData: CreateAnimationData = {
 *   name: 'walk',
 *   mediaId: 'media_123',
 *   prompt: 'A knight walking with armor clanking'
 * };
 * ```
 */
export interface CreateAnimationData {
  name: string;
  prompt: string;
  description?: string;
  type?: string;
}

/**
 * Animation update data
 * 
 * Used when updating existing animations.
 * 
 * @example
 * ```typescript
 * const updateAnimData: UpdateAnimationData = {
 *   name: 'run',
 *   prompt: 'Updated prompt for running animation'
 * };
 * ```
 */
export interface UpdateAnimationData {
  name?: string;
  mediaId?: string;
  prompt?: string;
  description?: string;
}

export type CharacterFromSchema = FromSchema<typeof characterSchema>;


/**
 * Character Model
 * 
 * Represents a 2D character that can be a classic character, monster, or animated object.
 * Contains frames, spritesheet, and animations for visual representation.
 * 
 * @example
 * ```typescript
 * const character: Character = {
 *   id: 'char_123',
 *   name: 'Hero Knight',
 *   description: 'A brave knight with shining armor',
 *   type: 'character',
 *   frames: ['frame1.png', 'frame2.png'],
 *   spritesheet: 'knight_spritesheet.png',
 *   animations: [
 *     { name: 'idle', frames: [0, 1, 2, 3], speed: 100 }
 *   ],
 *   metadata: { width: 64, height: 64 }
 * };
 * ```
 */
export interface Character {
  /** Unique identifier for the character */
  _id: string;
  
  /** Display name of the character */
  name: string;
  
  /** Description of the character */
  description: string;
  
  /** Type of character: character, monster, object, or animations */
  type: 'character' | 'monster' | 'object' | 'animations';
  
  /** Associated faceset media ID for character portraits */
  faceset?: string;
  
  /** Animation sequences with associated media and prompts */
  animations: CharacterAnimation[];
  
  /** Creation timestamp */
  createdAt: Date;
  
  /** Last modification timestamp */
  updatedAt: Date;
  
  /** Project ID this character belongs to */
  projectId: string;
  
  /** User ID who created this character */
  userId: string;
}

/**
 * Animation sequence for a character
 * 
 * Defines a sequence of frames to play with specific timing and behavior.
 * 
 * @example
 * ```typescript
 * const idleAnimation: Animation = {
 *   name: 'idle',
 *   frames: [0, 1, 2, 3, 2, 1],
 *   speed: 150,
 *   loop: true
 * };
 * ```
 */
/**
 * Character Animation with media association
 * 
 * Represents an animation sequence for a character with associated media and prompt.
 * 
 * @example
 * ```typescript
 * const animation: CharacterAnimation = {
 *   name: 'idle',
 *   mediaId: 'media_123',
 *   prompt: 'A knight standing idle with subtle breathing animation'
 * };
 * ```
 */
export interface CharacterAnimation {
  /** Name of the animation (e.g., 'idle', 'walk', 'attack') */
  name: string;
  
  /** Associated media ID containing the animation frames */
  mediaId: string;
  
  /** AI prompt used to generate this animation */
  prompt: string;
  
  /** Type of animation for AI generation (e.g., 'walk', 'attack', 'idle', 'emote') */
  type?: string;
  
  /** Optional description of the animation */
  description?: string;
}

/**
 * Legacy Animation interface for backward compatibility
 * 
 * @deprecated Use CharacterAnimation instead
 */
export interface Animation {
  /** Name of the animation (e.g., 'idle', 'walk', 'attack') */
  name: string;
  
  /** Array of frame indices to play in sequence */
  frames: number[];
  
  /** Duration in milliseconds between frames */
  speed: number;
  
  /** Whether the animation should loop */
  loop: boolean;
  
  /** Optional description of the animation */
  description?: string;
}

/**
 * Character metadata containing additional properties
 * 
 * Stores technical information about the character's visual properties.
 * 
 * @example
 * ```typescript
 * const metadata: CharacterMetadata = {
 *   width: 64,
 *   height: 64,
 *   frameWidth: 32,
 *   frameHeight: 32,
 *   tags: ['knight', 'hero', 'armor']
 * };
 * ```
 */
export interface CharacterMetadata {
  /** Width of the character in pixels */
  width?: number;
  
  /** Height of the character in pixels */
  height?: number;
  
  /** Width of individual frames in spritesheet */
  frameWidth?: number;
  
  /** Height of individual frames in spritesheet */
  frameHeight?: number;
  
  /** Tags for categorization and search */
  tags?: string[];
  
  /** Custom properties */
  [key: string]: any;
}



/**
 * Character update data
 * 
 * Used when updating existing characters.
 * 
 * @example
 * ```typescript
 * const updateData: UpdateCharacterData = {
 *   name: 'Updated Hero',
 *   description: 'Updated description',
 *   faceset: 'faceset_789'
 * };
 * ```
 */
export interface UpdateCharacterData {
  name?: string;
  description?: string;
  type?: 'character' | 'monster' | 'object' | 'animations';
  faceset?: string;
  animations?: CharacterAnimation[];
}

/**
 * Animation creation data
 * 
 * Used when creating new animations for a character.
 * 
 * @example
 * ```typescript
 * const createAnimData: CreateAnimationData = {
 *   name: 'walk',
 *   mediaId: 'media_123',
 *   prompt: 'A knight walking with armor clanking'
 * };
 * ```
 */
export interface CreateAnimationData {
  name: string;
  mediaId: string;
  prompt: string;
  description?: string;
}

/**
 * Animation update data
 * 
 * Used when updating existing animations.
 * 
 * @example
 * ```typescript
 * const updateAnimData: UpdateAnimationData = {
 *   name: 'run',
 *   prompt: 'Updated prompt for running animation'
 * };
 * ```
 */
export interface UpdateAnimationData {
  name?: string;
  mediaId?: string;
  prompt?: string;
  description?: string;
}

/**
 * AI generation request for character creation
 * 
 * Used when generating characters via AI with prompts and reference images.
 * 
 * @example
 * ```typescript
 * const aiRequest: AICharacterRequest = {
 *   prompt: 'A brave knight with golden armor',
 *   referenceImage: file,
 *   type: 'character',
 *   frameCount: 8
 * };
 * ```
 */
export interface AICharacterRequest {
  /** Text prompt describing the desired character */
  prompt: string;
  
  /** Optional reference image for the AI (base64 data URL) */
  referenceImage?: string;

  /** Type of character to generate */
  type: 'character' | 'monster' | 'object';
}
