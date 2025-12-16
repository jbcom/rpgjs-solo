import {PrebuiltComponentAnimations, RpgClient } from "@rpgjs/client";
import { defineModule } from "@rpgjs/common";

export default defineModule<RpgClient>({
  componentAnimations: [
    {
      id: 'hit',
      component: PrebuiltComponentAnimations.Hit
    }
  ]
})