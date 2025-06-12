import { findModules, provideModules } from "@rpgjs/common";
import { RpgClientEngine } from "./RpgClientEngine";
import { RpgClient } from "./RpgClient";
import { inject } from "@signe/di";
import { RpgGui } from "./Gui/Gui";

export function provideClientModules(modules: RpgClient[]) {
  return provideModules(modules, "client", (modules, context) => {
    const mainModuleClient = findModules(context, 'Client')
    modules = [...mainModuleClient, ...modules]
    modules = modules.map((module) => {
      if ('client' in module) {
        module = module.client as any;
      }
      if (module.spritesheets) {
        const spritesheets = [...module.spritesheets];
        module.spritesheets = {
          load: (engine: RpgClientEngine) => {
            spritesheets.forEach((spritesheet) => {
              engine.addSpriteSheet(spritesheet);
            });
          },
        };
      }
      if (module.sounds) {
        const sounds = [...module.sounds];
        module.sounds = {
          load: (engine: RpgClientEngine) => {
            sounds.forEach((sound) => {
              engine.addSound(sound);
            });
          },
        };
      }
      if (module.gui) {
        const gui = [...module.gui];
        module.gui = {
          load: (engine: RpgClientEngine) => {
            const guiService = inject(engine.context, RpgGui);
            gui.forEach((gui) => {
              guiService.add(gui);
            });
          },
        };
      }
      if (module.effects) {
        const effects = [...module.effects];
        module.effects = {
          load: (engine: RpgClientEngine) => {
            effects.forEach((effect) => {
              engine.addEffect(effect);
            });
          },
        };
      }
      if (module.particles) {
        const particles = [...module.particles];
        module.particles = {
          load: (engine: RpgClientEngine) => {
            particles.forEach((particle) => {
              engine.addParticle(particle);
            });
          },
        };
      }
      return module;
    });
    return modules
  });
}

export const GlobalConfigToken = "GlobalConfigToken";

export function provideGlobalConfig(config: any) {
  return {
    provide: GlobalConfigToken,
    useValue: config ?? {},
  };
}

export function provideClientGlobalConfig(config: any = {}) {
  if (!config.keyboardControls) {
    config.keyboardControls = {
      up: 'up',
      down: 'down',
      left: 'left',
      right: 'right',
      action: 'space'
    }
  }
  return provideGlobalConfig(config)
}

