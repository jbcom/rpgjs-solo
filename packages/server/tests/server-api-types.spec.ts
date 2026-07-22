import { describe, expectTypeOf, test } from "vitest";
import type { MapStreamDefinition, RpgActionInput } from "@rpgjs/common";
import { provideServerMapStreaming } from "@rpgjs/server";
import type {
  RpgEvent,
  RpgEventHooks,
  RpgMap,
  RpgMapHooks,
  RpgPlayer,
  RpgPlayerHooks,
  RpgPlayerSaveResult,
  RpgPlayerSlotLoadResult,
  RpgPlayerSnapshot,
  RpgPlayerSnapshotLoadResult,
  StateData,
  ServerMapStreamingAdapter,
} from "@rpgjs/server";

describe("server public API types", () => {
  test("player hooks match the runtime contracts", () => {
    const hooks = {
      async onLoad(player, snapshot) {
        expectTypeOf(player).toEqualTypeOf<RpgPlayer>();
        expectTypeOf(snapshot).toEqualTypeOf<RpgPlayerSnapshot>();
      },
      onSave(player, snapshot) {
        expectTypeOf(player).toEqualTypeOf<RpgPlayer>();
        expectTypeOf(snapshot).toEqualTypeOf<RpgPlayerSnapshot>();
      },
      onInput(player, input) {
        expectTypeOf(player).toEqualTypeOf<RpgPlayer>();
        expectTypeOf(input).toEqualTypeOf<RpgActionInput<unknown>>();
      },
      canChangeMap(player, nextMap) {
        expectTypeOf(player).toEqualTypeOf<RpgPlayer>();
        expectTypeOf(nextMap).toEqualTypeOf<{ id: string }>();
        return nextMap.id !== "forbidden";
      },
    } satisfies RpgPlayerHooks;

    expectTypeOf(hooks).toMatchTypeOf<RpgPlayerHooks>();
  });

  test("save and load overloads expose discriminated results", () => {
    const assertions = (player: RpgPlayer) => {
      expectTypeOf(player.snapshot()).toEqualTypeOf<RpgPlayerSnapshot>();
      expectTypeOf(player.applySnapshot({ name: "Hero" })).toEqualTypeOf<Promise<RpgPlayerSnapshot>>();
      expectTypeOf(player.save()).toEqualTypeOf<Promise<string>>();
      expectTypeOf(player.save(0)).toEqualTypeOf<Promise<RpgPlayerSaveResult | null>>();
      expectTypeOf(player.load(0)).toEqualTypeOf<Promise<RpgPlayerSlotLoadResult>>();
      expectTypeOf(player.load({ name: "Hero" })).toEqualTypeOf<Promise<RpgPlayerSnapshotLoadResult>>();
      expectTypeOf(player.getVariable("quest")).toEqualTypeOf<unknown>();
      expectTypeOf(player.getVariable<number>("quest")).toEqualTypeOf<number | undefined>();
      expectTypeOf(player.on<{ text: string }>("chat", payload => { void payload.text })).toEqualTypeOf<void>();
      expectTypeOf(player.getState("poison")).toEqualTypeOf<StateData | undefined>();
    };

    expectTypeOf(assertions).toBeFunction();
  });

  test("event and map hooks expose their complete arguments", () => {
    const eventHooks = {
      onAction(event, player, input) {
        expectTypeOf(event).toEqualTypeOf<RpgEvent>();
        expectTypeOf(player).toEqualTypeOf<RpgPlayer>();
        expectTypeOf(input).toEqualTypeOf<RpgActionInput<unknown>>();
      },
      onTouch(event, other, context) {
        expectTypeOf(event).toEqualTypeOf<RpgEvent>();
        expectTypeOf(other).toEqualTypeOf<RpgPlayer | RpgEvent>();
        expectTypeOf(context.map).toEqualTypeOf<RpgMap>();
      },
    } satisfies RpgEventHooks;

    const mapHooks = {
      onLoad(map) {
        expectTypeOf(map).toEqualTypeOf<RpgMap>();
      },
      onBeforeUpdate(data, map) {
        expectTypeOf(data).toEqualTypeOf<unknown>();
        expectTypeOf(map).toEqualTypeOf<RpgMap>();
      },
    } satisfies RpgMapHooks;

    expectTypeOf(eventHooks).toMatchTypeOf<RpgEventHooks>();
    expectTypeOf(mapHooks).toMatchTypeOf<RpgMapHooks>();
  });

  test("unknown hook names remain rejected", () => {
    const hooks: RpgPlayerHooks = {
      // @ts-expect-error typo in a built-in hook
      onLoadd() {},
    };
    expectTypeOf(hooks).toEqualTypeOf<RpgPlayerHooks>();
  });

  test("map streaming adapters keep provider-specific data typed", () => {
    type PrivateMap = { source: string };
    type ManifestData = { theme: string };
    type ChunkData = { tiles: number[] };
    const definition = {} as MapStreamDefinition<ManifestData, ChunkData>;
    const adapter = {
      compile(mapData, map) {
        expectTypeOf(mapData).toEqualTypeOf<PrivateMap>();
        expectTypeOf(map).toEqualTypeOf<RpgMap>();
        return definition;
      },
    } satisfies ServerMapStreamingAdapter<PrivateMap, ManifestData, ChunkData>;

    expectTypeOf(provideServerMapStreaming(adapter)).toMatchTypeOf<object>();
  });
});
