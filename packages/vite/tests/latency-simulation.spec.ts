import {
	PartyConnection,
	type RpgWebSocketConnection,
} from "@rpgjs/server/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockWebSocket = RpgWebSocketConnection & {
	readyState: number;
	send: ReturnType<typeof vi.fn>;
	close: ReturnType<typeof vi.fn>;
	on: ReturnType<typeof vi.fn>;
};

describe("PartyConnection latency simulation", () => {
	let socket: MockWebSocket;

	beforeEach(() => {
		vi.spyOn(console, "log").mockImplementation(() => undefined);
		PartyConnection.configurePacketLoss(false, 0);
		PartyConnection.configureBandwidth(false, 100);
		PartyConnection.configureLatency(false, 0);
		socket = {
			readyState: 1,
			send: vi.fn(),
			close: vi.fn(),
			on: vi.fn(),
		};
	});

	afterEach(() => {
		PartyConnection.configureLatency(false, 0);
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("configures and clamps the production fixed-latency boundary", () => {
		PartyConnection.configureLatency(true, 100, "sync");
		expect(PartyConnection.getLatencyStatus()).toEqual({
			enabled: true,
			ms: 100,
			filter: "sync",
		});

		PartyConnection.configureLatency(true, -50);
		expect(PartyConnection.getLatencyStatus()).toEqual({
			enabled: true,
			ms: 0,
			filter: "",
		});
	});

	it("sends immediately when latency is disabled", async () => {
		const connection = new PartyConnection(socket, "test-connection");
		await connection.send("test message");
		expect(socket.send).toHaveBeenCalledWith("test message");
	});

	it("delays a matching outgoing message by the configured duration", async () => {
		vi.useFakeTimers();
		PartyConnection.configureLatency(true, 50);
		const connection = new PartyConnection(socket, "test-connection");

		await connection.send("test message");
		await vi.advanceTimersByTimeAsync(49);
		expect(socket.send).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(socket.send).toHaveBeenCalledWith("test message");
	});

	it("applies the filter without delaying non-matching messages", async () => {
		vi.useFakeTimers();
		PartyConnection.configureLatency(true, 50, "sync");
		const connection = new PartyConnection(socket, "test-connection");

		await connection.send("sync message");
		await vi.advanceTimersByTimeAsync(49);
		expect(socket.send).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(socket.send).toHaveBeenCalledWith("sync message");

		await connection.send("normal message");
		expect(socket.send).toHaveBeenLastCalledWith("normal message");
	});

	it("preserves queue order while latency is active", async () => {
		vi.useFakeTimers();
		PartyConnection.configureLatency(true, 50);
		const connection = new PartyConnection(socket, "test-connection");

		await connection.send("first");
		await connection.send("second");
		await vi.advanceTimersByTimeAsync(49);
		expect(socket.send).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(socket.send).toHaveBeenNthCalledWith(1, "first");
		expect(socket.send).toHaveBeenNthCalledWith(2, "second");
	});

	it("does not send through a closed socket", async () => {
		socket.readyState = 3;
		const connection = new PartyConnection(socket, "test-connection");
		await connection.send("test message");
		expect(socket.send).not.toHaveBeenCalled();
	});

	it("serializes structured data through the production queue", async () => {
		const connection = new PartyConnection(socket, "test-connection");
		await connection.send({ type: "test", value: 123 });
		expect(socket.send).toHaveBeenCalledWith(
			JSON.stringify({ type: "test", value: 123 }),
		);
	});

	it("treats zero latency as immediate even when enabled", async () => {
		PartyConnection.configureLatency(true, 0);
		const connection = new PartyConnection(socket, "test-connection");
		await connection.send("test message");
		expect(socket.send).toHaveBeenCalledWith("test message");
	});

	it("handles high fixed latency deterministically", async () => {
		vi.useFakeTimers();
		PartyConnection.configureLatency(true, 1_000);
		const connection = new PartyConnection(socket, "test-connection");

		await connection.send("test message");
		await vi.advanceTimersByTimeAsync(999);
		expect(socket.send).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(socket.send).toHaveBeenCalledWith("test message");
	});
});
