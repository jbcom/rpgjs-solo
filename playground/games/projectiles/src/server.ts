import { createServer, provideServerModules } from "@rpgjs/server";
import { provideMain } from "./modules/main";

export default createServer({
  providers: [
    provideMain(),
    provideServerModules([]),
  ],
});
