import type { AnyBlockInstance } from "@common/blocks";
import { getGameDataProvider } from "./data-provider";

const isBlockInstance = (value: unknown): value is AnyBlockInstance => {
	if (!value || typeof value !== "object") return false;
	const block = value as { id?: unknown; type?: unknown };
	return (
		typeof block.id === "string" &&
		block.id.trim().length > 0 &&
		typeof block.type === "string" &&
		block.type.trim().length > 0
	);
};

/**
 * Read and validate a Studio block collection immediately before execution.
 * Collection reads deliberately bypass provider caching so a saved workflow
 * update becomes authoritative on the next invocation.
 */
export const resolveStudioBlockCollection = async (
	blockCollectionId: string,
): Promise<AnyBlockInstance[]> => {
	const provider = getGameDataProvider();
	if (typeof provider.getBlockCollection !== "function") {
		throw new Error(
			`Studio data provider cannot resolve block collection "${blockCollectionId}"`,
		);
	}

	const response = await provider.getBlockCollection(blockCollectionId);
	const collection =
		response &&
		typeof response === "object" &&
		"data" in response &&
		response.data &&
		typeof response.data === "object"
			? response.data
			: response;
	if (!collection || typeof collection !== "object") {
		throw new Error(
			`Studio block collection "${blockCollectionId}" was not found`,
		);
	}

	const blocks = (collection as { blocks?: unknown }).blocks;
	if (!Array.isArray(blocks) || !blocks.every(isBlockInstance)) {
		throw new Error(
			`Studio block collection "${blockCollectionId}" is malformed`,
		);
	}
	return blocks;
};
