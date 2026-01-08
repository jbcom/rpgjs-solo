# Optimistic GUI Actions

This architecture makes GUI actions feel instant on the client, while still reconciling with server state.
It is designed to be generic (items, skills, shop, future GUIs) and to work with existing `gui.open` flows.

## Goals

- UI updates immediately after user input (no waiting for round-trip).
- Server remains authoritative.
- Client reconciles when server sends updated data.

## How It Works

### 1) Client action pipeline

When a GUI component calls `onInteraction(name, data)`, the client:

1. Generates a `clientActionId`.
2. Applies an optimistic reducer (if registered for the GUI).
3. Sends the action to the server via `gui.interaction` with `clientActionId`.

### 2) Server reconcile

On the server, after processing an action, the GUI sends a **snapshot update**:

```
gui.update({ guiId, data, clientActionId })
```

The client:

- Replaces GUI data with the server snapshot.
- Removes the matching pending action (if `clientActionId` exists).
- Replays remaining pending actions to keep the UI responsive.

## Client API (RpgGui)

Register optimistic reducers per GUI:

```ts
gui.registerOptimisticReducer("rpg-main-menu", (data, action) => {
  if (action.name === "useItem") {
    // return next data
  }
  return data;
});
```

Reducers are pure functions that return a new data object (or the original one if no change).

## Server API (Gui)

Use `update()` to reconcile from the server:

```ts
gui.update(data, { clientActionId });
```

This is called after any action that changes GUI state (items, skills, shop, etc.).

## Built-In Example

The Main Menu already uses optimistic updates for:

- `useItem`
- `equipItem`

The server responds with a `gui.update` snapshot after each action to reconcile the local state.

## Extending the System

To add a new optimistic action:

1. Register a reducer for the GUI id.
2. Update GUI data immutably in the reducer.
3. Call `gui.update()` on the server after processing.

This keeps instant UX on the client and authoritative state on the server.
