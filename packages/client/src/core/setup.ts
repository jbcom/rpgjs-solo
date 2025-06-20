import { Context, FactoryProvider, findProvider, findProviders, inject, injector, Providers } from "@signe/di";
import { RpgClientEngine } from "../RpgClientEngine";
import { setInject } from "./inject";

interface SetupOptions {
  providers: Providers;
}


export async function startGame(options: SetupOptions) {
  const context = new Context();
  context['side'] = 'client'
  setInject(context);

  await injector(context, options.providers);

  const engine = inject(context, RpgClientEngine);
  await engine.start();
  return context;
}