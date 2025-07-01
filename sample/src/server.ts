import { createServer, Move, provideServerModules, RpgPlayer } from "@rpgjs/server";

export function Event() {
  return {
    name: "EV-1",
    onInit() {
      this.setGraphic("hero");
    },
    async onAction(player: RpgPlayer) {
      player.gold = 100;
      player.showText("Hello World", {
        talkWith: this
      });
    },
  };
}

export default createServer({
  providers: [
    provideServerModules([
      {
        player: {
          onConnected: (player: RpgPlayer) => {
            player.changeMap("simplemap");
          },
          onJoinMap: (player: RpgPlayer) => {
            player.teleport({
              x: 1000,
              y: 400,
            });
           
            player.setGraphic("hero");
            console.log(player.param)
          },
          onInput(player: RpgPlayer, input: any) {
            if (input.action) {
              // player.setAnimation("attack3", 1);
              const map = player.getCurrentMap();
              const event = map?.getEventBy(event => event.name() === "EV-1");
              event?.remove();
            }
          }
        },
        maps: [
          {
            id: "simplemap",
            events: [{x: 1000, y: 600, event: Event()}],
          },
        ],
      },
    ])
  ],
});
