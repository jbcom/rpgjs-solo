import type { AnyBlockInstance } from "@common/blocks";
import { getGameDataProvider } from "./data-provider";
import { validateStudioBlockSequence } from "./block-validation";

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

	const validation = validateStudioBlockSequence(
		(collection as { blocks?: unknown }).blocks,
	);
	if (!validation.valid) {
		throw new Error(
			`Studio block collection "${blockCollectionId}" is malformed: ${validation.reason}`,
		);
	}
	return validation.blocks;
};
