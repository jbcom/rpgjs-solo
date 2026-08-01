import type { ActionBattleEntity } from "../core/contracts";
import {
	type ActionBattleTilePoint,
	type ActionBattleTileSize,
	getActionBattleEntityTile,
	getActionBattleTileSize,
} from "../targeting";
import type { ActionBattleTargetingState } from "./state";

interface TargetingInputEngine {
	sceneMap?: unknown;
	stopProcessingInput?: boolean;
	acquireInputLock?: (owner?: object) => () => void;
	interruptCurrentPlayerMovement?: () => unknown;
}

interface TargetingInputControllerOptions {
	engine: TargetingInputEngine;
	isCurrentPlayer: () => boolean;
	getState: () => ActionBattleTargetingState;
	getPlayer: () => ActionBattleEntity | null | undefined;
	getTileSizeOverride?: () => ActionBattleTileSize | undefined;
	move: (dx: number, dy: number) => void;
	confirm: (target: ActionBattleTilePoint) => void;
	cancel: () => void;
}

const acquireLegacyInputLock = (engine: TargetingInputEngine) => {
	const previous = engine.stopProcessingInput === true;
	engine.stopProcessingInput = true;
	engine.interruptCurrentPlayerMovement?.();
	let released = false;
	return () => {
		if (released) return;
		released = true;
		engine.stopProcessingInput = previous;
	};
};

export const getActionBattleClientTileSize = (
	engine: TargetingInputEngine,
	override?: ActionBattleTileSize,
): ActionBattleTileSize => getActionBattleTileSize(engine.sceneMap, override);

export const getActionBattleClientTargetOrigin = (
	engine: TargetingInputEngine,
	player: ActionBattleEntity,
	override?: ActionBattleTileSize,
): ActionBattleTilePoint =>
	getActionBattleEntityTile(
		player,
		getActionBattleClientTileSize(engine, override),
	);

export const createActionBattleTargetingInputController = (
	options: TargetingInputControllerOptions,
) => {
	const owner = {};
	let releaseInput: (() => void) | undefined;

	const isActiveOwner = () =>
		options.isCurrentPlayer() && options.getState().active;

	const release = () => {
		const current = releaseInput;
		releaseInput = undefined;
		current?.();
	};

	const sync = () => {
		if (!isActiveOwner()) {
			release();
			return;
		}
		if (releaseInput) return;
		releaseInput = options.engine.acquireInputLock
			? options.engine.acquireInputLock(owner)
			: acquireLegacyInputLock(options.engine);
	};

	const move = (dx: number, dy: number) => {
		if (!isActiveOwner()) return false;
		options.move(dx, dy);
		return true;
	};

	const confirm = () => {
		if (!isActiveOwner()) return false;
		const player = options.getPlayer();
		if (!player) return false;
		const state = options.getState();
		const origin = getActionBattleClientTargetOrigin(
			options.engine,
			player,
			options.getTileSizeOverride?.(),
		);
		release();
		options.confirm({
			x: origin.x + state.offset.x,
			y: origin.y + state.offset.y,
		});
		return true;
	};

	const cancel = () => {
		if (!isActiveOwner()) return false;
		release();
		options.cancel();
		return true;
	};

	return { sync, move, confirm, cancel, destroy: release };
};
