---
title: "Save/Load Strategy (Client-Driven)"
description: "Guide for Save/Load Strategy (Client-Driven) in RPGJS."
---

# Save/Load Strategy (Client-Driven)

This guide explains how to use the client-driven save/load flow introduced for RPGJS.
The client requests the slot list and triggers save/load actions, while the server
executes `player.save(slot)` and `player.load(slot)` using a pluggable storage strategy.

## Concepts

- **Save storage strategy (server)**: decides where snapshots are stored (DB, file, memory).
- **Auto-save strategy (server)**: decides when saving/loading is allowed and the auto slot.
- **Save client service (client)**: requests slot list and triggers save/load actions.
- **Slots metadata**: what the UI displays (level, exp, map, date, custom fields).

## Server: provide a storage strategy

The server exposes `save.list`, `save.save`, and `save.load` actions. A storage
strategy is injected via DI; if none is provided, a memory-only strategy is used.
The server can also control whether saving/loading is allowed.

### Strategy contract

```ts
interface SaveStorageStrategy {
  list(player): Promise<Array<SaveSlotMeta | null>>;
  get(player, index): Promise<SaveSlot | null>;
  save(player, index, snapshot, meta): Promise<void>;
  delete?(player, index): Promise<void>;
  // storage only, no auto-save policy here
}
```

## Server: provide an auto-save strategy

```ts
interface AutoSaveStrategy {
  canSave?(player, context): boolean;
  canLoad?(player, context): boolean;
  shouldAutoSave?(player, context): boolean;
  getDefaultSlot?(player, context): number | null;
}
```

The `getDefaultSlot()` function is the **auto slot**. When you call `player.save()`
without a slot, this strategy decides which slot is used (e.g. always slot 0, or last
used slot).

### Auto-save example (server)

```ts
import { shouldAutoSave, provideAutoSave } from "@rpgjs/server";

const player: RpgPlayerHooks = {
  onStep(player) {
    if (shouldAutoSave(player, { reason: "auto", source: "step" })) {
      player.save("auto", {}, { reason: "auto", source: "step" });
    }
  }
};
```

### Register auto-save strategy

```ts
import { createServer, provideAutoSave } from "@rpgjs/server";

const server = createServer({
  providers: [
    provideAutoSave({
      canSave: (player) => player.hp > 0,
      getDefaultSlot: () => 0
    })
  ]
});
```

### Save points (server authority)

If you want to restrict saving to specific points, you can deny saves by default
and only allow them when the player interacts with a save point.

```ts
import { provideAutoSave } from "@rpgjs/server";

let saveEnabled = false;

const autoSave = {
  canSave: () => saveEnabled,
  getDefaultSlot: () => 0
};

// Somewhere in your event logic:
// saveEnabled = true; player.showSave(); saveEnabled = false;
```

### Register the strategy

```ts
import { createServer, provideSaveStorage } from "@rpgjs/server";

const server = createServer({
  providers: [
    provideSaveStorage(new MyStorageStrategy())
  ]
});
```

The server will build slot metadata automatically (level, exp, map, date), and you
can extend it by passing custom fields from the client.

### Built-in localStorage strategy (standalone)

For standalone mode (server running in the browser), use the built-in localStorage
strategy. It stores full slots (meta + snapshot) under a single key and can carry
an optional policy.

```ts
import { createServer, provideSaveStorage, LocalStorageSaveStorageStrategy } from "@rpgjs/server";

const server = createServer({
  providers: [
    provideSaveStorage(new LocalStorageSaveStorageStrategy({ key: "save" }))
  ]
});
```

## Client: request slots and trigger save/load

The client uses `SaveClientService` to talk to the server. It is already included
in `provideRpg()` and `provideMmorpg()`.

### Typical flow

1. Call `saveClient.listSlots()` to get the current slot list.
2. Show the Save/Load UI with those slots.
3. On interaction:
   - `saveClient.saveSlot(index)` for save.
   - `saveClient.loadSlot(index)` for load.

## Player API (server-side)

- `player.snapshot()` -> returns the raw snapshot object (low-level).
- `player.save(slot?)` -> stores a snapshot using the storage strategy.
  - If `slot` is omitted, the policy `getDefaultSlot()` is used.
- `player.load(slot?)` -> loads a slot using the storage strategy.

Use `player.snapshot()` if you need to serialize or inspect state without saving.

Examples:

```ts
await player.save();      // auto slot (policy)
await player.save(2);     // fixed slot
await player.load(2);     // fixed slot
```

## GUI options (auto slot + save disabled)

The save/load GUI can display a dedicated "Auto Save" slot at the top. It is
read-only in save mode, and selectable in load mode.

### Menu GUI (server-side)

`MenuGui.open()` accepts these options:

- `saveShowAutoSlot` (boolean) -> show the auto slot in the GUI
- `saveAutoSlotIndex` (number) -> which slot index to use for auto save
- `saveAutoSlotLabel` (string) -> label displayed for auto slot

`canSave` is computed from the AutoSaveStrategy and sent to the client; if false,
the "Save" entry is disabled in the menu.

### Save/Load component (client-side)

Props supported by the component:

- `showAutoSlot` (boolean)
- `autoSlotIndex` (number)
- `autoSlotLabel` (string)

When `showAutoSlot` is enabled:
- **save mode**: auto slot is displayed but read-only
- **load mode**: auto slot behaves like a normal slot and loads as usual

### Example (menu or title screen)

```ts
import { inject } from "@rpgjs/client";
import { RpgGui, SaveClientService } from "@rpgjs/client";

const gui = inject(RpgGui);
const saveClient = inject(SaveClientService);

async function openSaveMenu() {
  const slots = await saveClient.listSlots();
  gui.display("rpg-save", {
    mode: "save",
    slots,
    onInteraction: async (action, { index }) => {
      if (action === "save") await saveClient.saveSlot(index);
      if (action === "load") await saveClient.loadSlot(index);
    }
  });
}
```

## Events sent by the server

These are emitted to the client and handled by `SaveClientService`:

- `save.list.result` -> `{ requestId, slots }`
- `save.save.result` -> `{ requestId, index, slots }`
- `save.load.result` -> `{ requestId, index, ok, slot }`
- `save.error` -> `{ requestId, message }`

## Notes

- Works in standalone and client/server modes.
- Slot metadata is a free object, so you can display any custom fields.
- The Save/Load GUI only handles interactions; it does not fetch or persist slots.
