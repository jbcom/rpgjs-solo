import { RpgClient, RpgClientEngine } from "@rpgjs/client";
import { defineModule } from "@rpgjs/common";
import { effect } from "canvasengine";

export default defineModule<RpgClient>({
  engine: {
    async onStart(engine: RpgClientEngine<any>) {
     
    },
  },
});
