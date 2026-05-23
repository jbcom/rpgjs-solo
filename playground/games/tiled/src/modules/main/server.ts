import { defineModule } from "@rpgjs/common";
import { RpgServer } from "@rpgjs/server";
import { player } from './player'
import { Npc } from "./event";

export default defineModule<RpgServer>({
  player,
  maps: [
    {
      id: 'simplemap',
      events: [{
        id: 'EV-1',
        event: Npc()
      }]
    }
  ]
});
