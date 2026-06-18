import type { BlockContextCondition, BlockContextInfo, ExecutionCapability } from './types';
import type { EventType } from '../event-types';

/**
 * Helper functions for creating common context conditions
 * 
 * These helpers make it easier to create context conditions for blocks
 * without writing custom callback functions every time.
 */

/**
 * Creates a condition that checks if the event type matches one of the specified types
 * 
 * @param eventTypes - One or more event types to match
 * @returns A condition function that returns true if the context's eventType matches
 * 
 * @example
 * ```typescript
 * const condition = forEventTypes('enemy', 'character');
 * // Returns true if eventType is 'enemy' or 'character'
 * ```
 */
export function forEventTypes(...eventTypes: EventType[]): BlockContextCondition {
  return (context: BlockContextInfo) => {
    return eventTypes.includes(context.eventType);
  };
}

/**
 * Creates a condition that checks if the trigger matches one of the specified triggers
 * 
 * @param triggers - One or more trigger types to match
 * @returns A condition function that returns true if the context's trigger matches
 * 
 * @example
 * ```typescript
 * const condition = forTriggers('onAction', 'onBattleStart');
 * // Returns true if trigger is 'onAction' or 'onBattleStart'
 * ```
 */
export function forTriggers(...triggers: string[]): BlockContextCondition {
  return (context: BlockContextInfo) => {
    if (!context.trigger) {
      return false;
    }
    return triggers.includes(context.trigger);
  };
}


/**
 * Creates a condition that excludes certain event types
 * 
 * @param eventTypes - Event types to exclude
 * @returns A condition function that returns true if the context's eventType is NOT in the excluded list
 * 
 * @example
 * ```typescript
 * const condition = excludeEventTypes('enemy');
 * // Returns true for all event types except 'enemy'
 * ```
 */
export function excludeEventTypes(...eventTypes: EventType[]): BlockContextCondition {
  return (context: BlockContextInfo) => {
    return !eventTypes.includes(context.eventType);
  };
}

/**
 * Creates a condition that excludes certain triggers
 * 
 * @param triggers - Trigger types to exclude
 * @returns A condition function that returns true if the context's trigger is NOT in the excluded list
 * 
 * @example
 * ```typescript
 * const condition = excludeTriggers('onInit');
 * // Returns true for all triggers except 'onInit'
 * ```
 */
export function excludeTriggers(...triggers: string[]): BlockContextCondition {
  return (context: BlockContextInfo) => {
    if (!context.trigger) {
      return true; // If no trigger, it's not excluded
    }
    return !triggers.includes(context.trigger);
  };
}

/**
 * Combines multiple conditions with AND logic (all conditions must be true)
 * 
 * @param conditions - Array of condition functions to combine
 * @returns A condition function that returns true only if all conditions are true
 * 
 * @example
 * ```typescript
 * const condition = combineConditions(
 *   forEventTypes('enemy'),
 *   forTriggers('onAction', 'onBattleStart')
 * );
 * // Returns true only if eventType is 'enemy' AND trigger is 'onAction' or 'onBattleStart'
 * ```
 */
export function combineConditions(...conditions: BlockContextCondition[]): BlockContextCondition {
  return (context: BlockContextInfo) => {
    return conditions.every(condition => condition(context));
  };
}

/**
 * Combines multiple conditions with OR logic (at least one condition must be true)
 * 
 * @param conditions - Array of condition functions to combine
 * @returns A condition function that returns true if at least one condition is true
 * 
 * @example
 * ```typescript
 * const condition = combineConditionsOr(
 *   forEventTypes('enemy'),
 *   forEventTypes('character')
 * );
 * // Returns true if eventType is 'enemy' OR 'character'
 * ```
 */
export function combineConditionsOr(...conditions: BlockContextCondition[]): BlockContextCondition {
  return (context: BlockContextInfo) => {
    return conditions.some(condition => condition(context));
  };
}

/**
 * Creates a condition that always returns true (block always available)
 * 
 * @returns A condition function that always returns true
 * 
 * @example
 * ```typescript
 * const condition = alwaysAvailable();
 * // Block is always available regardless of context
 * ```
 */
export function alwaysAvailable(): BlockContextCondition {
  return () => true;
}

/**
 * Creates a condition that always returns false (block never available)
 * 
 * @returns A condition function that always returns false
 * 
 * @example
 * ```typescript
 * const condition = neverAvailable();
 * // Block is never available
 * ```
 */
export function neverAvailable(): BlockContextCondition {
  return () => false;
}

/**
 * Creates a condition that checks if a trigger is set (not null)
 * 
 * @returns A condition function that returns true if trigger is not null
 * 
 * @example
 * ```typescript
 * const condition = hasTrigger();
 * // Returns true if trigger is set
 * ```
 */
export function hasTrigger(): BlockContextCondition {
  return (context: BlockContextInfo) => {
    return context.trigger !== null;
  };
}

/**
 * Creates a condition that checks if a collection ID is set
 * 
 * @returns A condition function that returns true if collectionId is set
 * 
 * @example
 * ```typescript
 * const condition = hasCollectionId();
 * // Returns true if collectionId is set
 * ```
 */
export function hasCollectionId(): BlockContextCondition {
  return (context: BlockContextInfo) => {
    return context.collectionId !== null && context.collectionId !== undefined;
  };
}

export function requiresCapabilities(...capabilities: ExecutionCapability[]): BlockContextCondition {
  return (context: BlockContextInfo) => {
    const available = new Set(context.executionProfile.capabilities);
    return capabilities.every(capability => available.has(capability));
  };
}

export function withoutCapabilities(...capabilities: ExecutionCapability[]): BlockContextCondition {
  return (context: BlockContextInfo) => {
    const available = new Set(context.executionProfile.capabilities);
    return capabilities.every(capability => !available.has(capability));
  };
}

export function requiresPlayer(): BlockContextCondition {
  return requiresCapabilities('player');
}

export function requiresEvent(): BlockContextCondition {
  return requiresCapabilities('event');
}

export function requiresMap(): BlockContextCondition {
  return requiresCapabilities('map');
}

export function forSources(...sources: string[]): BlockContextCondition {
  return (context: BlockContextInfo) => {
    return sources.includes(context.executionProfile.source);
  };
}
