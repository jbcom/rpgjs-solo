---
title: "Item Commands"
description: "Inventory, equipment, and item usage commands for players."
---

# Item Commands

Inventory, equipment, and item usage commands for players.

## Members

- [addItem](#additem)
- [atk](#atk)
- [buyItem](#buyitem)
- [equip](#equip)
- [getItem](#getitem)
- [hasItem](#hasitem)
- [pdef](#pdef)
- [removeItem](#removeitem)
- [sdef](#sdef)
- [sellItem](#sellitem)
- [useItem](#useitem)

## addItem

Add an item in the player's inventory

You can add items using:
- Item class (automatically registered in database if needed)
- Item object (automatically registered in database if needed)
- String ID (must be pre-registered in database)

The `onAdd()` method is called on the ItemClass or ItemObject when the item is added.

- Source: `packages/server/src/Player/ItemManager.ts`
- Kind: `method`
- Defined in: `IItemManager`

### Signature

```ts
addItem(item: ItemClass | ItemObject | string, nb?: number): Item
```

### Parameters

- `item`: `ItemClass | ItemObject | string`
- `nb?`: `number`

### Returns

The item instance added to inventory

### Examples

```ts
import Potion from 'your-database/potion'

// Add using class
player.addItem(Potion, 5)

// Add using string ID (must be registered in database)
player.addItem('Potion', 3)

// Add using object
player.addItem({
  id: 'custom-potion',
  name: 'Custom Potion',
  price: 200,
  onAdd(player) {
    console.log('Custom potion added!')
  }
}, 2)
```

## atk

Get the player's attack (sum of items equipped)

Returns the total attack value from all equipped items on the player.

- Source: `packages/server/src/Player/ItemManager.ts`
- Kind: `property`
- Defined in: `IItemManager`

### Signature

```ts
atk: number
```

### Returns

Total attack value from equipped items

### Examples

```ts
console.log(player.atk) // 150 (sum of all equipped weapons/armors attack)
```

## buyItem

Purchases an item and reduces the amount of gold

The player's gold is reduced by `nb * item.price`. The item is then added to the inventory.
The `onAdd()` method is called on the ItemClass when the item is added.

- Source: `packages/server/src/Player/ItemManager.ts`
- Kind: `method`
- Defined in: `IItemManager`

### Signature

```ts
buyItem(item: ItemClass | ItemObject | string, nb?: number): Item
```

### Parameters

- `item`: `ItemClass | ItemObject | string`
- `nb?`: `number`

### Returns

Item instance added to inventory

### Examples

```ts
import Potion from 'your-database/potion'

try {
  player.buyItem(Potion)
} catch (err) {
  if (err.id === 'NOT_ENOUGH_GOLD') {
    console.log('Not enough gold!')
  } else if (err.id === 'NOT_PRICE') {
    console.log('Item has no price!')
  }
}
```

## equip

Equips a weapon or armor on a player

Think first to add the item in the inventory with the `addItem()` method before equipping the item,
or pass `"auto"` to add the item if it is missing and equip it.

The `onEquip()` method is called on the ItemClass when the item is equipped or unequipped.

- Source: `packages/server/src/Player/ItemManager.ts`
- Kind: `method`
- Defined in: `IItemManager`

### Signature

```ts
equip(itemId: string, equip?: boolean | 'auto'): void
```

### Parameters

- `itemId`: `string`
- `equip?`: `boolean | 'auto'`

### Examples

```ts
try {
  player.addItem('sword')
  player.equip('sword')
  // Later, unequip it
  player.equip('sword', false)
} catch (err) {
  console.log(err)
}
```

## getItem

Retrieves the information of an object: the number and the instance

The returned Item instance contains the quantity information accessible via `quantity()` method.

- Source: `packages/server/src/Player/ItemManager.ts`
- Kind: `method`
- Defined in: `IItemManager`

### Signature

```ts
getItem(itemClass: ItemClass | string): Item
```

### Parameters

- `itemClass`: `ItemClass | string`

### Returns

Item instance containing quantity and item data

### Examples

```ts
import Potion from 'your-database/potion'

player.addItem(Potion, 5)
const inventory = player.getItem(Potion)
console.log(inventory.quantity()) // 5
console.log(inventory) // <instance of Item>
```

## hasItem

Check if the player has the item in his inventory

- Source: `packages/server/src/Player/ItemManager.ts`
- Kind: `method`
- Defined in: `IItemManager`

### Signature

```ts
hasItem(itemClass: ItemClass | string): boolean
```

### Parameters

- `itemClass`: `ItemClass | string`

### Returns

`true` if player has the item, `false` otherwise

### Examples

```ts
import Potion from 'your-database/potion'

player.hasItem(Potion) // false
player.addItem(Potion, 1)
player.hasItem(Potion) // true
```

## pdef

Get the player's physical defense (sum of items equipped)

Returns the total physical defense value from all equipped items on the player.

- Source: `packages/server/src/Player/ItemManager.ts`
- Kind: `property`
- Defined in: `IItemManager`

### Signature

```ts
pdef: number
```

### Returns

Total physical defense value from equipped items

### Examples

```ts
console.log(player.pdef) // 80 (sum of all equipped armors physical defense)
```

## removeItem

Deletes an item from inventory

Decreases the quantity by `nb`. If the quantity falls to 0 or below, the item is removed from the inventory.
The method returns `undefined` if the item is completely removed.

The `onRemove()` method is called on the ItemClass when the item is removed.

- Source: `packages/server/src/Player/ItemManager.ts`
- Kind: `method`
- Defined in: `IItemManager`

### Signature

```ts
removeItem(itemClass: ItemClass | string, nb?: number): Item | undefined
```

### Parameters

- `itemClass`: `ItemClass | string`
- `nb?`: `number`

### Returns

Item instance or `undefined` if the item was completely removed

### Examples

```ts
import Potion from 'your-database/potion'

try {
  player.removeItem(Potion, 5)
} catch (err) {
  console.log(err) // { id: 'ITEM_NOT_INVENTORY', msg: '...' }
}
```

## sdef

Get the player's skill defense (sum of items equipped)

Returns the total skill defense value from all equipped items on the player.

- Source: `packages/server/src/Player/ItemManager.ts`
- Kind: `property`
- Defined in: `IItemManager`

### Signature

```ts
sdef: number
```

### Returns

Total skill defense value from equipped items

### Examples

```ts
console.log(player.sdef) // 60 (sum of all equipped armors skill defense)
```

## sellItem

Sell an item and the player wins the amount of the item divided by 2

The player receives `(item.price / 2) * nbToSell` gold. The item is removed from the inventory.
The `onRemove()` method is called on the ItemClass when the item is removed.

- Source: `packages/server/src/Player/ItemManager.ts`
- Kind: `method`
- Defined in: `IItemManager`

### Signature

```ts
sellItem(itemClass: ItemClass | string, nbToSell?: number): Item
```

### Parameters

- `itemClass`: `ItemClass | string`
- `nbToSell?`: `number`

### Returns

Item instance that was sold

### Examples

```ts
import Potion from 'your-database/potion'

try {
  player.addItem(Potion)
  player.sellItem(Potion)
} catch (err) {
  console.log(err)
}
```

## useItem

Use an object. Applies effects and states. Removes the object from the inventory

When an item is used:
- Effects are applied to the player (HP/MP restoration, etc.)
- States are applied/removed as defined in the item
- The item is removed from inventory (consumed)

If the item has a `hitRate` property (0-1), there's a chance the usage might fail.
If usage fails, the item is still removed and `onUseFailed()` is called instead of `onUse()`.

The `onUse()` method is called on the ItemClass if the use was successful.
The `onUseFailed()` method is called on the ItemClass if the chance roll failed.
The `onRemove()` method is called on the ItemClass when the item is removed.

- Source: `packages/server/src/Player/ItemManager.ts`
- Kind: `method`
- Defined in: `IItemManager`

### Signature

```ts
useItem(itemClass: ItemClass | string): Item
```

### Parameters

- `itemClass`: `ItemClass | string`

### Returns

Item instance that was used

### Examples

```ts
import Potion from 'your-database/potion'

try {
  player.addItem(Potion)
  player.useItem(Potion)
} catch (err) {
  if (err.id === 'USE_CHANCE_ITEM_FAILED') {
    console.log('Item usage failed due to chance roll')
  } else {
    console.log(err)
  }
}
```
