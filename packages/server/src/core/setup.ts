import { injector, Providers } from "@signe/di";
import { RpgServerEngine } from "../RpgServerEngine";
import { context } from "./context";
import { setInject } from "./inject";

interface SetupOptions {
  providers: Providers;
}

export function createServer(options: SetupOptions): any {
  return class extends RpgServerEngine {
    config = options;
    
    async onStart() {
      setInject(context);
      await injector(context, options.providers);
      return super.onStart();
    }
  };
}