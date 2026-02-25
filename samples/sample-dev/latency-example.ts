/**
 * Example demonstrating how to use RPG-JS latency simulation
 * 
 * This example shows how to configure and use the latency simulation
 * feature to test your game under various network conditions.
 */

import { RpgServerEngine } from '@rpgjs/server';
import { PartyConnection } from '@rpgjs/vite';

// Example server class that demonstrates latency simulation
class ExampleServer extends RpgServerEngine {
  constructor(room: any) {
    super(room);
    
    // Configure latency simulation for testing
    this.setupLatencySimulation();
  }

  /**
   * Setup latency simulation with different scenarios
   */
  private setupLatencySimulation() {
    // Scenario 1: Realistic internet latency (50-200ms)
    PartyConnection.configureLatency(true, 50, 200);
    
    // Scenario 2: High latency for specific message types
    // PartyConnection.configureLatency(true, 200, 500, 'world_update');
    
    // Scenario 3: Very high latency for testing extreme conditions
    // PartyConnection.configureLatency(true, 500, 1000);
    
    // Scenario 4: Combined with packet loss
    // PartyConnection.configurePacketLoss(true, 0.1); // 10% packet loss
    // PartyConnection.configureLatency(true, 100, 300);
    
    console.log('Latency simulation configured');
  }

  /**
   * Example of sending messages with different priorities
   */
  async onConnect(connection: any, context: any) {
    console.log(`Player connected: ${connection.id}`);
    
    // Send immediate welcome message (no latency)
    await connection.send({
      type: 'welcome',
      message: 'Welcome to the game!',
      playerId: connection.id
    });
    
    // Send world state with potential latency
    await this.room.broadcast({
      type: 'world_update',
      players: this.getPlayerList(),
      timestamp: Date.now()
    });
    
    // Send critical game event (should be sent immediately if using filters)
    await this.room.broadcast({
      type: 'critical_event',
      event: 'player_joined',
      data: { playerId: connection.id }
    });
  }

  /**
   * Example of handling player movement with latency simulation
   */
  async onMessage(message: string, connection: any) {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'player_move':
          // Update player position
          this.updatePlayerPosition(connection.id, data.position);
          
          // Broadcast movement to other players (will be delayed by latency simulation)
          await this.room.broadcast({
            type: 'player_moved',
            playerId: connection.id,
            position: data.position,
            timestamp: Date.now()
          }, [connection.id]); // Exclude the sender
          break;
          
        case 'chat_message':
          // Chat messages should be sent immediately (no latency)
          await this.room.broadcast({
            type: 'chat',
            playerId: connection.id,
            message: data.message,
            timestamp: Date.now()
          });
          break;
          
        case 'sync_request':
          // Send world sync (will be delayed by latency simulation)
          await connection.send({
            type: 'world_sync',
            worldState: this.getWorldState(),
            timestamp: Date.now()
          });
          break;
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  }

  /**
   * Example of dynamic latency configuration
   */
  async adjustLatencyForNetworkConditions(networkQuality: 'good' | 'poor' | 'very_poor') {
    switch (networkQuality) {
      case 'good':
        PartyConnection.configureLatency(true, 20, 80);
        break;
      case 'poor':
        PartyConnection.configureLatency(true, 100, 400);
        break;
      case 'very_poor':
        PartyConnection.configureLatency(true, 300, 800);
        break;
    }
    
    console.log(`Latency adjusted for ${networkQuality} network conditions`);
  }

  /**
   * Example of selective latency for different message types
   */
  async setupSelectiveLatency() {
    // High latency for world updates
    PartyConnection.configureLatency(true, 200, 500, 'world_update');
    
    // Medium latency for player movements
    PartyConnection.configureLatency(true, 100, 300, 'player_moved');
    
    // Low latency for critical events
    PartyConnection.configureLatency(true, 20, 50, 'critical_event');
    
    // No latency for chat messages (no filter applied)
    // PartyConnection.configureLatency(true, 0, 0, 'chat');
    
    console.log('Selective latency configured for different message types');
  }

  // Helper methods (implementations would depend on your game logic)
  private getPlayerList() {
    return Array.from(this.room.getConnections()).map(conn => ({
      id: conn.id,
      name: `Player_${conn.id}`
    }));
  }

  private updatePlayerPosition(playerId: string, position: any) {
    // Implementation would update player position in your game state
    console.log(`Player ${playerId} moved to`, position);
  }

  private getWorldState() {
    return {
      players: this.getPlayerList(),
      worldTime: Date.now(),
      // Add other world state data
    };
  }
}

// Example usage in your main server file
export default ExampleServer;

// Example of how to use the server with different latency configurations
if (require.main === module) {
  console.log('=== RPG-JS Latency Simulation Examples ===\n');
  
  // Example 1: Basic latency simulation
  console.log('1. Basic latency simulation (50-200ms):');
  PartyConnection.configureLatency(true, 50, 200);
  console.log('Status:', PartyConnection.getLatencyStatus());
  
  // Example 2: Selective latency
  console.log('\n2. Selective latency for sync messages:');
  PartyConnection.configureLatency(true, 100, 300, 'sync');
  console.log('Status:', PartyConnection.getLatencyStatus());
  
  // Example 3: Combined with packet loss
  console.log('\n3. Combined latency and packet loss:');
  PartyConnection.configurePacketLoss(true, 0.05); // 5% packet loss
  PartyConnection.configureLatency(true, 80, 250);
  console.log('Packet Loss Status:', PartyConnection.getPacketLossStatus());
  console.log('Latency Status:', PartyConnection.getLatencyStatus());
  
  // Example 4: Disable all simulation
  console.log('\n4. Disable all simulation:');
  PartyConnection.configurePacketLoss(false, 0);
  PartyConnection.configureLatency(false, 0, 0);
  console.log('All simulation disabled');
}
