import { defineModule } from "@rpgjs/common";
import { RpgPlayer, RpgServer } from "@rpgjs/server";
import { player } from './player'
import { Npc } from "./event";

export default defineModule<RpgServer>({
  player,
  maps: [
    {
      id: 'simplemap',
      events: [Npc()]
    }
  ]
});
