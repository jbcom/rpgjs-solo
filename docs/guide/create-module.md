# Creating Modules in RPGJS

This guide explains how to create and structure modules in RPGJS using `defineModule` and `createModule`.

## Module Structure

A typical module consists of three main files:
- `server.ts` - Server-side logic and hooks
- `client.ts` - Client-side logic and hooks  
- `index.ts` - Module configuration and dependency injection

## Step 1: Define Server-Side Module

Create a `server.ts` file using `defineModule` to define server-side behavior:

```typescript
import { RpgEvent, RpgPlayer, type RpgServer } from "@rpgjs/server";
import { defineModule } from "@rpgjs/common";

export default defineModule<RpgServer>({
    player: {},
})
```

## Step 2: Define Client-Side Module

Create a `client.ts` file using `defineModule` for client-side logic:

```typescript
import { RpgClient, RpgClientEngine } from "@rpgjs/client";
import { defineModule } from "@rpgjs/common";

export default defineModule<RpgClient>({
    // Client-side hooks and logic
    // Add your client-side event handlers here
})
```

## Step 3: Create Module with Dependency Injection

Create an `index.ts` file using `createModule` to configure the module and its dependencies:

```typescript
import server from "./server";
import client from "./client";
import { createModule } from "@rpgjs/common";
import { BattleAi } from "./ai";

export function provideBattle() {
  return createModule("Battle", [
    {
      server,
      client,
    },
  ]);
}
```

## Understanding createModule Parameters

The `createModule` function takes two parameters:

### 1. Token Name (First Parameter)
- **Purpose**: Unique identifier for dependency injection
- **Usage**: Allows other modules to inject this module as a dependency
- **Example**: `"Battle"` can be injected elsewhere using this token

### 2. Dependencies Array (Second Parameter)
The array can contain two types of objects:

#### Dependency Injection Objects
```typescript
{
  provide: "BattleActionRpg",  // Token name for injection
  useClass: BattleAi,          // Class to instantiate
}
```

#### Server/Client Extension Objects
```typescript
{
  server,  // Extends server-side functionality
  client,  // Extends client-side functionality
}
```

## How Hooks Work

When you include `server` and `client` objects in the `createModule` array, they **extend** the core modules with additional hooks:

- **Server hooks**: Extend `RpgServer` with custom player and event behaviors
- **Client hooks**: Extend `RpgClient` with custom client-side logic
- **Event-driven**: Hooks are automatically called at specific game events

## Example Usage

```typescript
// In your main game configuration
import { provideBattle } from "./modules/battle";

const gameModules = [
  provideBattle(),
  // other modules...
];
```

This modular approach allows for clean separation of concerns, easy testing, and flexible dependency management in your RPGJS game.
