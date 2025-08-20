import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the PartyConnection class for testing
class MockPartyConnection {
  public static latencyEnabled: boolean = false;
  public static latencyMinMs: number = 50;
  public static latencyMaxMs: number = 200;
  public static latencyFilter: string = '';

  public id: string;
  private ws: any;

  constructor(ws: any, id?: string) {
    this.ws = ws;
    this.id = id || 'test-connection';
  }

  async send(data: any): Promise<void> {
    if (this.ws.readyState === 1) {
      const message = typeof data === "string" ? data : JSON.stringify(data);
      
      // Check if latency simulation is enabled
      if (MockPartyConnection.latencyEnabled && MockPartyConnection.latencyMaxMs > 0) {
        // Apply filter if specified
        if (MockPartyConnection.latencyFilter && !message.includes(MockPartyConnection.latencyFilter)) {
          this.ws.send(message);
          return;
        }
        
        // Calculate random latency between min and max
        const latencyMs = Math.random() * (MockPartyConnection.latencyMaxMs - MockPartyConnection.latencyMinMs) + MockPartyConnection.latencyMinMs;
        
        // Delay the message
        await new Promise(resolve => setTimeout(resolve, latencyMs));
      }
      
      this.ws.send(message);
    }
  }

  static configureLatency(enabled: boolean, minMs: number, maxMs: number, filter?: string): void {
    MockPartyConnection.latencyEnabled = enabled;
    MockPartyConnection.latencyMinMs = Math.max(0, minMs);
    MockPartyConnection.latencyMaxMs = Math.max(MockPartyConnection.latencyMinMs, maxMs);
    MockPartyConnection.latencyFilter = filter || '';
  }

  static getLatencyStatus(): { enabled: boolean; minMs: number; maxMs: number; filter: string } {
    return {
      enabled: MockPartyConnection.latencyEnabled,
      minMs: MockPartyConnection.latencyMinMs,
      maxMs: MockPartyConnection.latencyMaxMs,
      filter: MockPartyConnection.latencyFilter
    };
  }
}

describe('Latency Simulation', () => {
  let mockWs: any;

  beforeEach(() => {
    // Reset latency settings before each test
    MockPartyConnection.configureLatency(false, 0, 0);
    
    // Create mock WebSocket
    mockWs = {
      readyState: 1, // WebSocket.OPEN
      send: vi.fn(),
      close: vi.fn()
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Configuration', () => {
    it('should configure latency settings correctly', () => {
      MockPartyConnection.configureLatency(true, 100, 300, 'sync');
      
      const status = MockPartyConnection.getLatencyStatus();
      expect(status.enabled).toBe(true);
      expect(status.minMs).toBe(100);
      expect(status.maxMs).toBe(300);
      expect(status.filter).toBe('sync');
    });

    it('should clamp minMs to 0', () => {
      MockPartyConnection.configureLatency(true, -50, 200);
      
      const status = MockPartyConnection.getLatencyStatus();
      expect(status.minMs).toBe(0);
    });

    it('should ensure maxMs is at least minMs', () => {
      MockPartyConnection.configureLatency(true, 200, 100);
      
      const status = MockPartyConnection.getLatencyStatus();
      expect(status.maxMs).toBe(200); // Should be set to minMs value
    });

    it('should disable latency when enabled is false', () => {
      MockPartyConnection.configureLatency(false, 100, 300);
      
      const status = MockPartyConnection.getLatencyStatus();
      expect(status.enabled).toBe(false);
    });
  });

  describe('Message Sending', () => {
    it('should send message immediately when latency is disabled', async () => {
      const connection = new MockPartyConnection(mockWs);
      const startTime = Date.now();
      
      await connection.send('test message');
      
      const endTime = Date.now();
      expect(mockWs.send).toHaveBeenCalledWith('test message');
      expect(endTime - startTime).toBeLessThan(10); // Should be almost immediate
    });

    it('should delay message when latency is enabled', async () => {
      MockPartyConnection.configureLatency(true, 50, 100);
      const connection = new MockPartyConnection(mockWs);
      const startTime = Date.now();
      
      await connection.send('test message');
      
      const endTime = Date.now();
      expect(mockWs.send).toHaveBeenCalledWith('test message');
      expect(endTime - startTime).toBeGreaterThanOrEqual(50);
      expect(endTime - startTime).toBeLessThanOrEqual(150); // Allow some buffer
    });

    it('should apply filter correctly', async () => {
      MockPartyConnection.configureLatency(true, 50, 100, 'sync');
      const connection = new MockPartyConnection(mockWs);
      
      // Message with filter should be delayed
      const startTime1 = Date.now();
      await connection.send('sync message');
      const endTime1 = Date.now();
      expect(endTime1 - startTime1).toBeGreaterThanOrEqual(50);
      
      // Message without filter should be sent immediately
      const startTime2 = Date.now();
      await connection.send('normal message');
      const endTime2 = Date.now();
      expect(endTime2 - startTime2).toBeLessThan(10);
    });

    it('should not send when WebSocket is not open', async () => {
      mockWs.readyState = 3; // WebSocket.CLOSED
      const connection = new MockPartyConnection(mockWs);
      
      await connection.send('test message');
      
      expect(mockWs.send).not.toHaveBeenCalled();
    });

    it('should handle JSON data correctly', async () => {
      const connection = new MockPartyConnection(mockWs);
      const testData = { type: 'test', value: 123 };
      
      await connection.send(testData);
      
      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify(testData));
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero latency range', async () => {
      MockPartyConnection.configureLatency(true, 0, 0);
      const connection = new MockPartyConnection(mockWs);
      const startTime = Date.now();
      
      await connection.send('test message');
      
      const endTime = Date.now();
      expect(mockWs.send).toHaveBeenCalledWith('test message');
      expect(endTime - startTime).toBeLessThan(10); // Should be immediate
    });

    it('should handle very high latency', async () => {
      MockPartyConnection.configureLatency(true, 1000, 2000);
      const connection = new MockPartyConnection(mockWs);
      const startTime = Date.now();
      
      await connection.send('test message');
      
      const endTime = Date.now();
      expect(mockWs.send).toHaveBeenCalledWith('test message');
      expect(endTime - startTime).toBeGreaterThanOrEqual(1000);
      expect(endTime - startTime).toBeLessThanOrEqual(2100); // Allow buffer
    });

    it('should handle empty filter string', async () => {
      MockPartyConnection.configureLatency(true, 50, 100, '');
      const connection = new MockPartyConnection(mockWs);
      const startTime = Date.now();
      
      await connection.send('test message');
      
      const endTime = Date.now();
      expect(mockWs.send).toHaveBeenCalledWith('test message');
      expect(endTime - startTime).toBeGreaterThanOrEqual(50); // Should still be delayed
    });
  });
});
