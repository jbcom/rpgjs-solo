---
title: "Latency Simulation"
description: "Guide for Latency Simulation in RPGJS."
---

# Latency Simulation

RPG-JS provides built-in latency simulation capabilities to test how your game behaves under various network conditions. This feature allows you to simulate realistic network delays between the server and clients.

## Overview

Latency simulation adds configurable delays to outgoing messages from the server to clients, helping you:

- Test game responsiveness under poor network conditions
- Validate client-side prediction and reconciliation systems
- Ensure smooth gameplay even with high latency
- Debug synchronization issues

## Configuration

### Environment Variables

You can configure latency simulation using environment variables:

```bash
# Enable latency simulation
RPGJS_ENABLE_LATENCY=true

# Set minimum and maximum latency in milliseconds
RPGJS_LATENCY_MIN_MS=50
RPGJS_LATENCY_MAX_MS=200

# Optional: Only apply latency to messages containing specific text
RPGJS_LATENCY_FILTER=sync
```

### Programmatic Configuration

You can also configure latency simulation programmatically:

```typescript
import { PartyConnection } from '@rpgjs/vite';

// Enable latency simulation with 100-300ms range
PartyConnection.configureLatency(true, 100, 300);

// Enable latency only for synchronization messages
PartyConnection.configureLatency(true, 50, 150, 'sync');

// Disable latency simulation
PartyConnection.configureLatency(false, 0, 0);
```

## Usage Examples

### Basic Latency Simulation

```typescript
// In your server configuration
PartyConnection.configureLatency(true, 100, 300);

// All outgoing messages will now have 100-300ms random delays
room.broadcast({ type: 'player_move', data: playerData });
```

### Selective Latency

```typescript
// Only apply latency to synchronization messages
PartyConnection.configureLatency(true, 50, 150, 'sync');

// This message will be delayed (contains 'sync')
room.broadcast({ type: 'sync', data: worldState });

// This message will be sent immediately (no 'sync' in content)
room.broadcast({ type: 'chat', message: 'Hello!' });
```

### Combined with Packet Loss

You can use latency simulation together with packet loss simulation:

```typescript
// Configure both packet loss and latency
PartyConnection.configurePacketLoss(true, 0.1); // 10% packet loss
PartyConnection.configureLatency(true, 100, 300); // 100-300ms latency

// Messages will first be delayed, then potentially dropped
room.broadcast({ type: 'update', data: gameState });
```

## Monitoring

The server logs will show latency simulation activity:

```
[LATENCY SIMULATION] Connection conn_123: Delaying message by 156.7ms
[MESSAGE DATA] {"type":"sync","data":{"players":[...]}}
```

## Best Practices

### 1. Realistic Latency Values

Use realistic latency ranges based on your target network conditions:

- **Local/LAN**: 1-10ms
- **Good Internet**: 20-100ms
- **Poor Internet**: 100-500ms
- **Mobile/3G**: 200-1000ms

### 2. Selective Application

Use filters to apply latency only to specific message types:

```typescript
// Apply high latency to world updates
PartyConnection.configureLatency(true, 200, 500, 'world_update');

// Apply low latency to critical messages
PartyConnection.configureLatency(true, 10, 50, 'critical');
```

### 3. Testing Different Scenarios

Test various latency scenarios:

```typescript
// Test with very high latency
PartyConnection.configureLatency(true, 500, 1000);

// Test with variable latency (simulates unstable connections)
PartyConnection.configureLatency(true, 50, 300);

// Test with consistent low latency
PartyConnection.configureLatency(true, 20, 30);
```

### 4. Client-Side Considerations

When latency simulation is enabled, ensure your client:

- Implements proper client-side prediction
- Uses interpolation for smooth movement
- Handles message ordering correctly
- Provides visual feedback for network conditions

## API Reference

### PartyConnection.configureLatency()

Configures latency simulation settings.

**Parameters:**
- `enabled` (boolean): Whether to enable latency simulation
- `minMs` (number): Minimum latency in milliseconds
- `maxMs` (number): Maximum latency in milliseconds
- `filter` (string, optional): Only apply latency to messages containing this string

### PartyConnection.getLatencyStatus()

Returns current latency simulation configuration.

**Returns:**
```typescript
{
  enabled: boolean;
  minMs: number;
  maxMs: number;
  filter: string;
}
```

## Troubleshooting

### Messages Not Being Delayed

1. Check if latency simulation is enabled: `PartyConnection.getLatencyStatus()`
2. Verify the filter string matches your message content
3. Ensure `maxMs` is greater than 0

### Performance Issues

1. High latency values may affect server performance
2. Consider using filters to limit which messages are delayed
3. Monitor server logs for excessive delay messages

### Client Disconnections

1. Very high latency may cause client timeouts
2. Adjust client-side timeout settings accordingly
3. Consider implementing heartbeat mechanisms
