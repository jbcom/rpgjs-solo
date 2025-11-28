import { findModules, provideModules } from "@rpgjs/common";
import { RpgClientEngine } from "./RpgClientEngine";
import { RpgClient } from "./RpgClient";
import { inject } from "@signe/di";
import { RpgGui } from "./Gui/Gui";
import { getSoundMetadata } from "./Sound";

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
      if (module.spritesheetResolver) {
        const resolver = module.spritesheetResolver;
        module.spritesheetResolver = {
          load: (engine: RpgClientEngine) => {
            engine.setSpritesheetResolver(resolver);
          },
        };
      }
      if (module.sounds) {
        const sounds = [...module.sounds];
        module.sounds = {
          load: (engine: RpgClientEngine) => {
            sounds.forEach((sound) => {
              // Check if it's a class decorated with @Sound
              if (typeof sound === 'function' || (sound && sound.constructor && sound.constructor !== Object)) {
                const metadata = getSoundMetadata(sound);
                if (metadata) {
                  // Handle single sound
                  if (metadata.id && metadata.sound) {
                    engine.addSound({
                      id: metadata.id,
                      src: metadata.sound,
                      loop: metadata.loop,
                      volume: metadata.volume,
                    });
                  }
                  // Handle multiple sounds
                  if (metadata.sounds) {
                    Object.entries(metadata.sounds).forEach(([soundId, soundSrc]) => {
                      engine.addSound({
                        id: soundId,
                        src: soundSrc,
                        loop: metadata.loop,
                        volume: metadata.volume,
                      });
                    });
                  }
                } else {
                  // Not a decorated class, treat as regular sound object
                  engine.addSound(sound);
                }
              } else {
                // Regular sound object
                engine.addSound(sound);
              }
            });
          },
        };
      }
      if (module.soundResolver) {
        const resolver = module.soundResolver;
        module.soundResolver = {
          load: (engine: RpgClientEngine) => {
            engine.setSoundResolver(resolver);
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
      if (module.componentAnimations) {
        const componentAnimations = [...module.componentAnimations];
        module.componentAnimations = {
          load: (engine: RpgClientEngine) => {
            componentAnimations.forEach((componentAnimation) => {
              engine.addComponentAnimation(componentAnimation);
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
      if (module.sprite) {
        const sprite = {...module.sprite};
        module.sprite = {
          ...sprite,
          load: (engine: RpgClientEngine) => {
            if (sprite.componentsBehind) {
              sprite.componentsBehind.forEach((component) => {
                engine.addSpriteComponentBehind(component);
              });
            }
            if (sprite.componentsInFront) {
              sprite.componentsInFront.forEach((component) => {
                engine.addSpriteComponentInFront(component);
              });
            }
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

