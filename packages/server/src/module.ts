import { findModules, provideModules } from "@rpgjs/common";
import { FactoryProvider } from "@signe/di";
import { RpgServerEngine } from "./RpgServerEngine";
import { RpgMap } from "./rooms/map";
import { RpgPlayer } from "./Player/Player";

export function provideServerModules(modules: any[]): FactoryProvider {
  return provideModules(modules, "server", (modules, context) => {
    const mainModuleServer = findModules(context, 'Server')
    modules = [...mainModuleServer, ...modules]
    modules = modules.map((module) => {
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
      return module;
    })
    return modules
  });
}
 