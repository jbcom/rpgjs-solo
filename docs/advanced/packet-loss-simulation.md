# Packet Loss Simulation

The RPG-JS Vite plugin includes a built-in packet loss simulation feature that allows you to test how your game behaves under poor network conditions.

## Overview

This feature simulates real-world network conditions by randomly preventing the server from processing certain messages received from clients, simulating what happens when the server doesn't receive certain packets due to network issues. This is useful for:

- Testing server-side message handling under poor network conditions
- Validating game state synchronization when messages are lost
- Ensuring your server handles missing client messages gracefully
- Debugging network-related issues in multiplayer games

## Configuration

### Environment Variables

You can configure packet loss simulation using environment variables:

```bash
# Enable packet loss simulation
export RPGJS_ENABLE_PACKET_LOSS=true

# Set packet loss rate (0.0 to 1.0, where 0.1 = 10% packet loss)
export RPGJS_PACKET_LOSS_RATE=0.15

# Optional: Only simulate loss for messages containing specific text
export RPGJS_PACKET_LOSS_FILTER="sync"
```

### Programmatic Configuration

You can also configure packet loss simulation programmatically:

```typescript
import { PartyConnection } from '@rpgjs/vite';

// Enable 20% packet loss for all incoming messages
PartyConnection.configurePacketLoss(true, 0.2);

// Enable 15% packet loss only for sync messages
PartyConnection.configurePacketLoss(true, 0.15, 'sync');

// Disable packet loss simulation
PartyConnection.configurePacketLoss(false, 0);

// Get current status
const status = PartyConnection.getPacketLossStatus();
console.log(status); // { enabled: true, rate: 0.2, filter: 'sync' }
```

## Usage Examples

### Basic Setup

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { serverPlugin } from '@rpgjs/vite';
import startServer from './src/server';

export default defineConfig({
  plugins: [
    serverPlugin(startServer)
  ]
});
```

### Testing Different Network Conditions

```typescript
// Test with 5% packet loss (good connection)
PartyConnection.configurePacketLoss(true, 0.05);

// Test with 25% packet loss (poor connection)
PartyConnection.configurePacketLoss(true, 0.25);

// Test with 50% packet loss (very poor connection)
PartyConnection.configurePacketLoss(true, 0.5);

// Test with 20% packet loss only for synchronization messages
PartyConnection.configurePacketLoss(true, 0.2, 'sync');

// Test with 30% packet loss only for player movement messages
PartyConnection.configurePacketLoss(true, 0.3, 'playerMove');
```

## Console Output

When packet loss simulation is enabled, you'll see colored logs in your terminal:

- **Green**: `[PACKET RECEIVED]` - Message will be processed by server
- **Red**: `[PACKET LOSS]` - Message dropped (server won't process it)
- **Yellow**: `[PACKET DATA]` - Content of the dropped message
- **Purple**: `[PACKET LOSS SIMULATION]` - Configuration changes
- **Cyan**: `[NETWORK SIMULATION]` - Startup status

Example output:
```
[PACKET LOSS SIMULATION] Enabled with 15.0% loss rate (filtered: "sync")
[NETWORK SIMULATION] Packet loss simulation: 15.0% loss rate (filter: "sync")
[PACKET RECEIVED] Connection conn_123: Server will process this message
[PACKET LOSS] Connection conn_123: Server won't receive this message (15.0% loss rate)
[PACKET DATA] {"type":"sync","playerId":"player1","position":{"x":100,"y":200}}...
```

## Best Practices

1. **Use realistic rates**: 5-15% packet loss is common in poor network conditions
2. **Test incrementally**: Start with low rates and gradually increase
3. **Use filters strategically**: Target specific message types (like 'sync' or 'playerMove') to test critical game systems
4. **Monitor server behavior**: Ensure your server handles missing messages gracefully
5. **Test reconnection**: Verify that clients can reconnect and sync state properly
6. **Disable in production**: Always disable packet loss simulation in production builds

## Packet Filtering

You can use the `RPGJS_PACKET_LOSS_FILTER` environment variable or the filter parameter in `configurePacketLoss()` to only simulate packet loss for specific types of messages. This is useful for:

- Testing only synchronization messages: `filter: 'sync'`
- Testing only player movement: `filter: 'playerMove'`
- Testing only battle updates: `filter: 'battle'`

When a filter is set, only messages containing the filter string will be subject to packet loss simulation. All other messages will be processed normally.

## Implementation Details

The packet loss simulation works by:

1. Intercepting all incoming WebSocket messages in the `ws.on("message")` handler
2. Generating a random number between 0 and 1
3. Comparing against the configured loss rate
4. Either processing the message normally or dropping it with a log message

This simulation only affects messages sent from client to server, simulating what happens when the server doesn't receive certain packets due to network issues. Server-to-client messages are not affected.

## Troubleshooting

### Packet Loss Not Working

1. Verify environment variables are set correctly
2. Check that `RPGJS_ENABLE_PACKET_LOSS=true`
3. Ensure `RPGJS_PACKET_LOSS_RATE` is greater than 0
4. Look for the startup log message confirming configuration

### Too Much Packet Loss

- Reduce the `RPGJS_PACKET_LOSS_RATE` value
- Use values between 0.05 (5%) and 0.25 (25%) for realistic testing

### No Logs Appearing

- Ensure your client is sending messages to the server
- Check that WebSocket connections are established
- Verify console output is not being filtered
