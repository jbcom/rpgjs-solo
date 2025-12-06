import { findModules, provideModules } from "@rpgjs/common";
import { FactoryProvider } from "@signe/di";
import { RpgServerEngine } from "./RpgServerEngine";
import { RpgMap } from "./rooms/map";
import { RpgPlayer } from "./Player/Player";
import { RpgServer } from "./RpgServer";

/**
 * Type for server modules that can be either:
 * - An object implementing RpgServer interface
 * - A class decorated with @RpgModule decorator
 */
export type RpgServerModule = RpgServer | (new () => any);

/**
 * Provides server modules configuration to Angular Dependency Injection
 * 
 * This function accepts an array of server modules that can be either:
 * - Objects implementing the RpgServer interface
 * - Classes decorated with the @RpgModule decorator (which will be instantiated)
 * 
 * @param modules - Array of server modules (objects or classes)
 * @returns FactoryProvider configuration for Angular DI
 * @example
 * ```ts
 * // Using an object
 * provideServerModules([
 *   {
 *     player: {
 *       onConnected(player) {
 *         console.log('Player connected')
 *       }
 *     }
 *   }
 * ])
 * 
 * // Using a decorated class
 * @RpgModule<RpgServer>({
 *   engine: {
 *     onStart(server) {
 *       console.log('Server started')
 *     }
 *   }
 * })
 * class MyServerModule {}
 * 
 * provideServerModules([MyServerModule])
 * ```
 */
export function provideServerModules(modules: RpgServerModule[]): FactoryProvider {
  return provideModules(modules, "server", (modules, context) => {
    const mainModuleServer = findModules(context, 'Server')
    modules = [...mainModuleServer, ...modules]
    modules = modules.map((module) => {
      // If module is a class (constructor function), instantiate it
      // The RpgModule decorator adds properties to the prototype, which will be accessible via the instance
      if (typeof module === 'function') {
        const instance = new module() as any;
        // Copy all enumerable properties (including from prototype) to a plain object
        const moduleObj: any = {};
        for (const key in instance) {
          moduleObj[key] = instance[key];
        }
        module = moduleObj;
      }
      if ('server' in module) {
        module = module.server as any;
      }
      if (module.player?.props) {
        module = {
          ...module,
          playerProps: {
            load: (player: RpgPlayer) => {
              player.setSync(module.player.props)
            },
          }
        };
      }
      if (module.maps && Array.isArray(module.maps)) {
        const maps = [...module.maps];
        module = {
          ...module,
          maps: {
            load: (engine: RpgMap) => {
              maps.forEach((map) => {
                engine.maps.push(map);
              });
            },
          }
        };
      }
      if (module.worldMaps && Array.isArray(module.worldMaps)) {
        const worldMaps = [...module.worldMaps];
        module = {
          ...module,
          worldMaps: {
            load: (engine: RpgMap) => {
              worldMaps.forEach((worldMap) => {
                engine.createDynamicWorldMaps(worldMap)
              });
            },
          }
        };
      }
      return module;
    })
    return modules
  });
}
 