/**
 * Canvas Engine Component Type Declarations
 * 
 * This file declares module types for Canvas Engine components (.ce files)
 * to enable TypeScript support and proper import resolution.
 */

declare module "*.ce" {
  /**
   * Canvas Engine Component
   * 
   * @description Represents a Canvas Engine component that can be imported
   * and used within the application. These components combine template markup
   * with reactive JavaScript logic.
   * 
   * @example
   * ```typescript
   * import MyComponent from "./components/my-component.ce";
   * 
   * // Use the component in your application
   * const componentInstance = MyComponent;
   * ```
   */
  const component: any;
  export default component;
} 