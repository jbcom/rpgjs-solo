import { inject, PrebuiltComponentAnimations, RpgClient, RpgClientEngine, RpgGui } from "@rpgjs/client";
import { defineModule } from "@rpgjs/common";
import ActionBarComponent from "./components/action-bar.ce";
import TargetingOverlayComponent from "./components/targeting-overlay.ce";
import { setActionBattleOptions } from "./ui/state";
import { ActionBattleOptions } from "./types";
import { normalizeActionBattleOptions } from "./config";

export const createActionBattleClient = (
  options: ActionBattleOptions = {}
) => {
  const normalized = normalizeActionBattleOptions(options);
  setActionBattleOptions(normalized);
  const actionBarEnabled = normalized.ui?.actionBar?.enabled;
  const targetingEnabled = normalized.ui?.targeting?.enabled;
  const hitComponent = PrebuiltComponentAnimations?.Hit;
  return defineModule<RpgClient>({
    componentAnimations: hitComponent
      ? [
          {
            id: "hit",
            component: hitComponent,
          },
        ]
      : [],
    gui: actionBarEnabled
      ? [
          {
            id: "action-battle-action-bar",
            component: ActionBarComponent,
            dependencies: () => {
              const engine = inject(RpgClientEngine)
              return [engine.scene.currentPlayer]
            },
          },
        ]
      : [],
    sprite: {
      componentsInFront: targetingEnabled ? [TargetingOverlayComponent] : [],
    },
    sceneMap: {
      onAfterLoading() {
        const gui = inject(RpgGui)
        gui.display('action-battle-action-bar')
      }
    }
  });
};

export default createActionBattleClient();
