import {
  provideClientGlobalConfig,
  provideClientModules,
  provideLoadMap,
} from "@rpgjs/client";
import { provideVueGui } from "@rpgjs/vue";
import SampleMap from "../components/sample-map.ce";
import HudGui from "../gui/HudGui.vue";
import InventoryGui from "../gui/InventoryGui.vue";
import QuestLogGui from "../gui/QuestLogGui.vue";
import NameplateGui from "../gui/NameplateGui.vue";

export default {
  providers: [
    provideLoadMap((id: string) => {
      return {
        id,
        component: SampleMap,
        width: 720,
        height: 480,
        hitboxes: [],
        data: {
          label: "Vue GUI Map",
        },
      };
    }),
    provideVueGui({
      selector: "#vue-gui-overlay",
      createIfNotFound: true,
    }),
    provideClientGlobalConfig(),
    provideClientModules([
      {
        gui: [
          {
            id: "vue-hud",
            component: HudGui,
            autoDisplay: true,
            data: {
              title: "Vue GUI Sample",
              hint: "Space/Enter: inventory, Escape: quest log",
            },
          },
          {
            id: "vue-inventory",
            component: InventoryGui,
          },
          {
            id: "vue-quest-log",
            component: QuestLogGui,
          },
          {
            id: "vue-nameplate",
            component: NameplateGui,
            attachToSprite: true,
          },
        ],
      },
    ]),
  ],
};
