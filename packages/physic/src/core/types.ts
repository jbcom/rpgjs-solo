/**
 * Core types and identifiers
 */

/**
 * Unique identifier for entities (UUID v4 format)
 */
export type UUID = string;

/**
 * Numeric identifier for entities (for performance)
 */
export type EntityId = number;

/**
 * Entity state flags
 */
export enum EntityState {
  /** Static entity (does not move) */
  Static = 1 << 0,
  /** Dynamic entity (affected by forces) */
  Dynamic = 1 << 1,
  /** Sleeping entity (inactive, not updated) */
  Sleeping = 1 << 2,
  /** Kinematic entity (moved manually, but can collide) */
  Kinematic = 1 << 3,
}

