---
title: "Create database"
description: "Register items, skills, states, and other game data."
---

# Create database

The database is where you register reusable game data such as items, skills, classes, states, or custom objects.

## Register data in `provideServerModules`

```ts
import { provideServerModules } from "@rpgjs/server";
import { Potion } from "./database/Potion";

provideServerModules([
  {
    database: {
      Potion
    }
  }
]);
```

Once registered, you can use string IDs from the server:

```ts
player.addItem("Potion", 1);
```

## Add data dynamically on a map

You can also register data at runtime:

```ts
map.addInDatabase("treasure-coin", {
  id: "treasure-coin",
  name: "Treasure Coin",
  price: 500
});

player.addItem("treasure-coin", 1);
```

## What belongs in the database

- items
- skills
- states
- classes
- custom server-side objects used by your game

## Recommended flow

1. Put shared game data in `database`
2. Keep map-specific or temporary content dynamic with `map.addInDatabase()`
3. Use string IDs from gameplay code when possible

## More details

See [Items System](/guide/items) for a complete example with item hooks and dynamic items.

## Next step

Continue with [Create sounds](/guide/create-sounds).

