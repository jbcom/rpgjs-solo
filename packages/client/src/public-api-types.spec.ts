import { describe, expectTypeOf, test } from "vitest";
import type { RpgContext, RpgProvider } from "@rpgjs/common";
import {
  provideMmorpg,
  startGame,
  type GuiRegistration,
  type GuiRenderer,
  type RpgClientEngine,
  type RpgMusicManager,
  type RpgMusicTransitionOptions,
} from "./index";

describe("client public API types", () => {
  test("bootstrap and providers expose RPGJS-owned contracts", () => {
    expectTypeOf(provideMmorpg({})).toEqualTypeOf<RpgProvider[]>();
    const assertions = (start: typeof startGame) => {
      expectTypeOf(start({ providers: [] })).toEqualTypeOf<Promise<RpgContext>>();
    };
    expectTypeOf(assertions).toBeFunction();
  });

  test("the Signe Context class is not re-exported", () => {
    // @ts-expect-error Context is available only from direct advanced Signe usage
    type LegacyContext = typeof import("./index")["Context"];
    expectTypeOf<LegacyContext>();
  });

  test("GUI registrations expose renderer-neutral typed data", () => {
    type DialogData = { message: string };
    const registration: GuiRegistration<DialogData> = {
      id: "dialog",
      component: () => null,
      renderer: "canvas",
      data: { message: "Hello" },
    };

    expectTypeOf(registration.renderer).toEqualTypeOf<GuiRenderer | undefined>();
    expectTypeOf(registration.data).toEqualTypeOf<DialogData | undefined>();
  });

  test("temporary music exposes a typed transition controller", () => {
    expectTypeOf<RpgMusicManager["enter"]>().toEqualTypeOf<(
      id: string | undefined,
      options?: RpgMusicTransitionOptions,
      owner?: object,
    ) => Promise<void>>();
    expectTypeOf<RpgMusicManager["leave"]>().toEqualTypeOf<(
      options?: RpgMusicTransitionOptions,
      owner?: object,
    ) => void>();
  });

  test("scoped input locks expose an idempotent release boundary", () => {
    expectTypeOf<RpgClientEngine["acquireInputLock"]>().returns.toEqualTypeOf<
      () => void
    >();
    expectTypeOf<
      RpgClientEngine["isInputProcessingStopped"]
    >().returns.toEqualTypeOf<boolean>();
  });
});
