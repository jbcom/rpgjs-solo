import { generateUID } from "@rpgjs/common";
import { signal } from "canvasengine";

/**
 * Manages active transitions in the game
 * 
 * This class handles the lifecycle of screen transitions, such as fade effects,
 * slide transitions, or any custom transition components. It maintains a list
 * of currently active transitions and provides methods to start and finish them.
 * 
 * ## Design
 * 
 * - Uses signals to track active transitions reactively
 * - Each transition has a unique ID for identification
 * - Transitions automatically remove themselves when finished via onFinish callback
 * - Supports multiple simultaneous transitions if needed
 * 
 * @example
 * ```ts
 * const manager = new TransitionManager();
 * 
 * // Start a fade transition
 * manager.start('fade', { duration: 1000 });
 * 
 * // Check active transitions
 * console.log(manager.current()); // Array of active transitions
 * ```
 */
export class TransitionManager {
  /**
   * Signal containing all currently active transitions
   * 
   * Each transition object contains:
   * - id: Unique identifier
   * - props: Properties passed to the transition component
   * - onFinish: Callback to remove the transition when complete
   */
  current = signal<any[]>([]);

  /**
   * Start a new transition
   * 
   * Creates a new transition instance with the given props and adds it to
   * the active transitions list. The transition will be automatically removed
   * when it calls its onFinish callback.
   * 
   * @param props - Properties to pass to the transition component (must include onFinish)
   * @returns The created transition object with id and onFinish callback
   * 
   * @example
   * ```ts
   * const transition = manager.start({
   *   duration: 1000,
   *   color: 'black',
   *   onFinish: () => console.log('Transition complete')
   * });
   * ```
   */
  start(props: any) {
    const id = generateUID();
    const transition = {
      ...props,
      id,
      onFinish: () => {
        const index = this.current().findIndex((value) => value.id === id);
        if (index !== -1) {
          this.current().splice(index, 1);
        }
      },
    };
    
    this.current().push(transition);
    return transition;
  }
}
