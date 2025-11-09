/**
 * UUID generation utilities
 * 
 * Generates UUID v4 for entity identification.
 * Deterministic version can be used for testing.
 */

/**
 * Generates a random UUID v4
 * 
 * @returns UUID string
 * 
 * @example
 * ```typescript
 * const id = generateUUID(); // "550e8400-e29b-41d4-a716-446655440000"
 * ```
 */
export function generateUUID(): string {
  // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generates a deterministic UUID from a seed
 * 
 * Simple hash-based UUID for testing and deterministic scenarios.
 * Not cryptographically secure.
 * 
 * @param seed - Seed value for generation
 * @returns Deterministic UUID string
 */
export function generateDeterministicUUID(seed: number): string {
  // Simple hash function for deterministic UUIDs
  let hash = seed;
  hash = ((hash << 5) - hash) + seed;
  hash = hash & hash; // Convert to 32-bit integer
  
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `00000000-0000-4000-8000-${hex.padStart(12, '0')}`;
}

