---
title: "GUI Commands"
description: "Dialogs, menus, notifications, and custom GUI commands."
---

# GUI Commands

Dialogs, menus, notifications, and custom GUI commands.

## Members

- [Call Game Over Menu](#call-game-over-menu)
- [Call Main Menu](#call-main-menu)
- [Displays a notification](#displays-a-notification)
- [Show Choices](#show-choices)
- [Show Load](#show-load)
- [Show Save](#show-save)
- [Show Save/Load](#show-save-load)
- [Show Text](#show-text)

## Call Game Over Menu

Calls game over menu. Opens the GUI named `rpg-gameover`

```ts
const selection = await player.callGameover()
if (selection?.id === 'title') {
    await player.gui('rpg-title-screen').open()
}
if (selection?.id === 'load') {
    await player.showLoad()
}
```

- Source: `packages/server/src/Player/GuiManager.ts`
- Kind: `method`
- Member of: `GuiManager`
- Defined in: `IGuiManager`

### Signature

```ts
player.callGameover(options)
```

### Parameters

- `options?`: `GameoverGuiOptions`

## Call Main Menu

Calls main menu. Opens the GUI named `rpg-main-menu`

- Source: `packages/server/src/Player/GuiManager.ts`
- Kind: `method`
- Member of: `GuiManager`
- Defined in: `IGuiManager`

### Signature

```ts
player.callMainMenu(options)
```

### Parameters

- `options?`: `MenuGuiOptions`

## Displays a notification

Displays a notification . Opens the GUI named `rpg-notification`

- Source: `packages/server/src/Player/GuiManager.ts`
- Kind: `method`
- Member of: `GuiManager`
- Defined in: `IGuiManager`

### Signature

```ts
player.showNotification()
```

### Parameters

- `message`: `string`
- `options?`: `{ time?: number; icon?: string; sound?: string; type?: "info" | "warn" | "error" }`

## Show Choices

Shows a dialog box with a choice. Opens the GUI named `rpg-dialog`

```ts
const choice = await player.showChoices('What color do you prefer?', [
     { text: 'Black', value: 'black' },
     { text: 'Rather the blue', value: 'blue' },
     { text: 'I don\'t have a preference!', value: 'none' }
])

// If the player selects the first
console.log(choice) // { text: 'Black', value: 'black' }
```

- Source: `packages/server/src/Player/GuiManager.ts`
- Kind: `method`
- Member of: `GuiManager`
- Defined in: `IGuiManager`

### Signature

```ts
player.showChoices(text,choices)
```

### Parameters

- `msg`: `string`
- `choices`: `Choice[]`
- `options?`: `DialogOptions`

## Show Load

Display a load slots screen. Opens the GUI named `rpg-save`

```ts
const index = await player.showLoad(slots)
```

- Source: `packages/server/src/Player/GuiManager.ts`
- Kind: `method`
- Member of: `GuiManager`
- Defined in: `IGuiManager`

### Signature

```ts
player.showLoad(slots,options)
```

### Parameters

- `slots?`: `SaveSlot[]`
- `options?`: `SaveLoadOptions`

## Show Save

Display a save slots screen. Opens the GUI named `rpg-save`

```ts
const index = await player.showSave(slots)
```

- Source: `packages/server/src/Player/GuiManager.ts`
- Kind: `method`
- Member of: `GuiManager`
- Defined in: `IGuiManager`

### Signature

```ts
player.showSave(slots,options)
```

### Parameters

- `slots?`: `SaveSlot[]`
- `options?`: `SaveLoadOptions`

## Show Save/Load

Display a save/load slots screen. Opens the GUI named `rpg-save`

```ts
const index = await player.showSaveLoad(slots, { mode: 'save' })
```

- Source: `packages/server/src/Player/GuiManager.ts`
- Kind: `method`
- Member of: `GuiManager`
- Defined in: `IGuiManager`

### Signature

```ts
player.showSaveLoad(slots,options)
```

### Parameters

- `slots?`: `SaveSlot[]`
- `options?`: `SaveLoadOptions`

## Show Text

Show a text. This is a graphical interface already built. Opens the GUI named `rpg-dialog`

```ts
player.showText('Hello World')
```

The method returns a promise. It is resolved when the dialog box is closed.

```ts
await player.showText('Hello World')
// dialog box is closed, then ...
```

**Option: position**

You can define how the dialog box is displayed:
- top
- middle
- bottom

(bottom by default)

```ts
player.showText('Hello World', {
     position: 'top'
})
```

**Option: fullWidth**

`boolean` (true by default)

Indicate that the dialog box will take the full width of the screen.

```ts
player.showText('Hello World', {
     fullWidth: true
})
```

**Option: autoClose**

`boolean` (false by default)

If false, the user will have to press Enter to close the dialog box.

 ```ts
player.showText('Hello World', {
     autoClose: true
})
```

**Option: typewriterEffect**

`boolean` (true by default)

Performs a typewriter effect

 ```ts
player.showText('Hello World', {
     typewriterEffect: false
})
```

**Option: talkWith**

`RpgPlayer` (nothing by default)

If you specify the event or another player, the other player will stop his or her movement and look in the player's direction.

 ```ts
// Code in an event
player.showText('Hello World', {
     talkWith: this
})
```

- Source: `packages/server/src/Player/GuiManager.ts`
- Kind: `method`
- Member of: `GuiManager`
- Defined in: `IGuiManager`

### Signature

```ts
player.showText(text,options)
```

### Parameters

- `msg`: `string`
- `options?`: `DialogOptions`
