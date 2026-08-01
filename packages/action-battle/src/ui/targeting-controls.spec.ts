import { describe, expect, test, vi } from "vitest";
import { createActionBattleTargetingInputController } from "./targeting-controls";

const targetingState = () => ({
	active: true,
	skill: { id: "cross", name: "Cross", usable: true },
	range: 4,
	offset: { x: 1, y: -1 },
	aoeMask: ["#"],
});

describe("Action Battle targeting input controller", () => {
	test("only the current-player component handles a shared targeting key", () => {
		const move = vi.fn();
		const options = {
			engine: { sceneMap: { tileWidth: 32, tileHeight: 32 } },
			getState: targetingState,
			getPlayer: () => ({
				x: () => 0,
				y: () => 0,
				hitbox: () => ({ w: 32, h: 32 }),
			}),
			move,
			confirm: vi.fn(),
			cancel: vi.fn(),
		};
		const playerController = createActionBattleTargetingInputController({
			...options,
			isCurrentPlayer: () => true,
		});
		const eventController = createActionBattleTargetingInputController({
			...options,
			isCurrentPlayer: () => false,
		});

		expect(playerController.move(1, 0)).toBe(true);
		expect(eventController.move(1, 0)).toBe(false);
		expect(move).toHaveBeenCalledTimes(1);
	});

	test("locks normal input and releases it before dispatching confirmation", () => {
		const release = vi.fn();
		const acquireInputLock = vi.fn(() => release);
		const confirm = vi.fn(() => expect(release).toHaveBeenCalledTimes(1));
		const controller = createActionBattleTargetingInputController({
			engine: {
				sceneMap: { tileWidth: 16, tileHeight: 24 },
				acquireInputLock,
			},
			isCurrentPlayer: () => true,
			getState: targetingState,
			getPlayer: () => ({
				x: () => 16,
				y: () => 24,
				hitbox: () => ({ w: 8, h: 8 }),
			}),
			move: vi.fn(),
			confirm,
			cancel: vi.fn(),
		});

		controller.sync();
		controller.sync();
		expect(acquireInputLock).toHaveBeenCalledTimes(1);

		expect(controller.confirm()).toBe(true);
		expect(confirm).toHaveBeenCalledWith({ x: 2, y: 0 });
	});

	test("uses the same configured tile geometry for origin and confirmation", () => {
		const confirm = vi.fn();
		const controller = createActionBattleTargetingInputController({
			engine: { sceneMap: { tileWidth: 32, tileHeight: 32 } },
			isCurrentPlayer: () => true,
			getState: targetingState,
			getPlayer: () => ({
				x: () => 16,
				y: () => 24,
				hitbox: () => ({ w: 8, h: 8 }),
			}),
			getTileSizeOverride: () => ({ width: 10, height: 14 }),
			move: vi.fn(),
			confirm,
			cancel: vi.fn(),
		});

		controller.confirm();
		expect(confirm).toHaveBeenCalledWith({ x: 3, y: 1 });
	});

	test("preserves an existing legacy input stop when scoped locks are unavailable", () => {
		const engine = {
			sceneMap: { tileWidth: 32, tileHeight: 32 },
			stopProcessingInput: true,
		};
		const controller = createActionBattleTargetingInputController({
			engine,
			isCurrentPlayer: () => true,
			getState: targetingState,
			getPlayer: () => null,
			move: vi.fn(),
			confirm: vi.fn(),
			cancel: vi.fn(),
		});

		controller.sync();
		expect(engine.stopProcessingInput).toBe(true);
		controller.destroy();
		expect(engine.stopProcessingInput).toBe(true);
	});
});
