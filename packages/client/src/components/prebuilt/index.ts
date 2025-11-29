/**
 * Prebuilt sprite components for common UI elements
 * 
 * This module exports ready-to-use components that can be attached
 * to sprites using componentsInFront or componentsBehind configuration.
 * 
 * @example
 * ```ts
 * import { HpBar } from '@rpgjs/client/components/prebuilt';
 * 
 * export default defineModule<RpgClient>({
 *   sprite: {
 *     componentsInFront: [HpBar]
 *   }
 * })
 * ```
 */

export { default as HpBar } from './hp-bar.ce';



