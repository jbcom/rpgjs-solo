# Save/Load Strategy (Client-Driven)

This guide explains how to use the client-driven save/load flow introduced for RPGJS.
The client requests the slot list and triggers save/load actions, while the server
executes `player.save()` and `player.load()` using a pluggable storage strategy.

## Concepts

- **Save storage strategy (server)**: decides where snapshots are stored (DB, file, memory).
- **Save client service (client)**: requests slot list and triggers save/load actions.
- **Slots metadata**: what the UI displays (level, exp, map, date, custom fields).

## Server: provide a storage strategy

The server exposes `save.list`, `save.save`, and `save.load` actions. A storage
strategy is injected via DI; if none is provided, a memory-only strategy is used.

### Strategy contract

```ts
interface SaveStorageStrategy {
  list(player): Promise<Array<SaveSlotMeta | null>>;
  get(player, index): Promise<SaveSlot | null>;
  save(player, index, snapshot, meta): Promise<void>;
  delete?(player, index): Promise<void>;
}
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

## Client: request slots and trigger save/load

The client uses `SaveClientService` to talk to the server. It is already included
in `provideRpg()` and `provideMmorpg()`.

### Typical flow

1. Call `saveClient.listSlots()` to get the current slot list.
2. Show the Save/Load UI with those slots.
3. On interaction:
   - `saveClient.saveSlot(index)` for save.
   - `saveClient.loadSlot(index)` for load.

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
