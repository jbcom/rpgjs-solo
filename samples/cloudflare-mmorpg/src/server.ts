import { createServer, provideServerModules } from "@rpgjs/server";

export default createServer({
  providers: [
    provideServerModules([
      {
        maps: [
          {
            id: "demo",
            file: "src/tiled/demo.tmx",
            events: [],
          },
        ],
      },
    ]),
  ],
});
