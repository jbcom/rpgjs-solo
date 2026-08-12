import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const ledgerPath = join(
	rootDirectory,
	"docs/internal/upstream-beta30-disposition.json",
);
const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));

const expectedCommits = [
	{
		commit: "e0bba29640372f2eba2dbc6f667f250ab69fbea3",
		parent: "2fab01fb8e93ad13902b07db28935f058b387213",
		tree: "4a3f58c0e640e7b7e9f850d40c791dca9c2666b1",
		pathTouchCount: 25,
	},
	{
		commit: "d005fddb8f26481b81df993f57607c06504a9e83",
		parent: "e0bba29640372f2eba2dbc6f667f250ab69fbea3",
		tree: "3c13887a2064a7f9be0c96af41ceb901bb1b7d9b",
		pathTouchCount: 7,
	},
	{
		commit: "aed4d3ed49dffe998c65e849b2ed5b2395e44f63",
		parent: "d005fddb8f26481b81df993f57607c06504a9e83",
		tree: "68a6809fff6079d67d5d72951a124f1c410377df",
		pathTouchCount: 6,
	},
	{
		commit: "5a306c9bd0caa1b65f5c73607eb0de7e60111078",
		parent: "aed4d3ed49dffe998c65e849b2ed5b2395e44f63",
		tree: "1a7648386f044d789a093e4494767f05b1a1c1bf",
		pathTouchCount: 26,
	},
];

const fail = (message) => {
	throw new Error(`Upstream beta.30 disposition invalid: ${message}`);
};
const assert = (condition, message) => {
	if (!condition) fail(message);
};
const exactJson = (actual, expected, message) =>
	assert(JSON.stringify(actual) === JSON.stringify(expected), message);
const countBy = (values) =>
	Object.fromEntries(
		[...new Set(values)]
			.sort()
			.map((value) => [value, values.filter((candidate) => candidate === value).length]),
	);
const git = (arguments_, encoding = "utf8") => {
	const result = spawnSync("git", arguments_, {
		cwd: rootDirectory,
		encoding,
		stdio: ["ignore", "pipe", "pipe"],
		maxBuffer: 32 * 1024 * 1024,
	});
	if (result.status !== 0) {
		fail(
			`git ${arguments_.join(" ")} failed: ${String(result.stderr).trim() || `exit ${result.status}`}`,
		);
	}
	return result.stdout;
};

assert(
	ledger.schema?.name === "rpgjs-solo-upstream-path-touch-disposition-ledger" &&
		ledger.schema?.version === "1.0.0",
	"unknown ledger schema",
);
assert(
	ledger.artifact?.status === "PROPOSAL_NOT_IMPLEMENTATION" &&
		ledger.artifact?.claimsAnyBehaviorPorted === false,
	"audit ledger must remain a non-implementation proposal",
);
assert(
	ledger.sourceRange?.oldCommit === expectedCommits[0].parent &&
		ledger.sourceRange?.newCommit === expectedCommits.at(-1).commit &&
		ledger.sourceRange?.strictLinearAncestry === true,
	"source range or ancestry contract drifted",
);
assert(ledger.commits?.length === expectedCommits.length, "commit count drifted");

const touches = [];
for (const [index, expected] of expectedCommits.entries()) {
	const record = ledger.commits[index];
	exactJson(
		{
			commit: record.commit,
			parent: record.parent,
			tree: record.tree,
			pathTouchCount: record.pathTouchCount,
		},
		expected,
		`commit ${index + 1} identity drifted`,
	);
	assert(
		record.touches?.length === expected.pathTouchCount,
		`${record.commit} touch count drifted`,
	);
	assert(
		git(["rev-parse", `${record.commit}^{tree}`]).trim() === record.tree,
		`${record.commit} tree does not match the immutable upstream object`,
	);
	assert(
		git(["rev-parse", `${record.commit}^`]).trim() === record.parent,
		`${record.commit} is not attached to its declared parent`,
	);

	const sourceRows = git([
		"diff-tree",
		"--no-commit-id",
		"--name-status",
		"-r",
		record.commit,
	])
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [status, ...pathParts] = line.split("\t");
			return { status, path: pathParts.at(-1) };
		});
	exactJson(
		record.touches.map(({ status, path }) => ({ status, path })),
		sourceRows,
		`${record.commit} does not exhaustively match its path touches`,
	);

	for (const touch of record.touches) {
		assert(
			touch.commit === record.commit && touch.parent === record.parent,
			`${touch.touchId} escapes its commit record`,
		);
		assert(
			touch.touchId === `${record.commit}:${touch.path}`,
			`${touch.path} has a non-canonical touch identity`,
		);
		const sourceBlob = git(["rev-parse", `${record.commit}:${touch.path}`]).trim();
		assert(sourceBlob === touch.sourceBlob, `${touch.touchId} blob drifted`);
		const rawSource = git(["show", `${record.commit}:${touch.path}`], null);
		assert(
			createHash("sha256").update(rawSource).digest("hex") === touch.rawSha256,
			`${touch.touchId} raw SHA-256 drifted`,
		);
		assert(touch.behaviors?.length > 0, `${touch.touchId} has no behavior units`);
		assert(
			touch.behaviors.every(
				(behavior) =>
					behavior.validationContracts?.length > 0 &&
					behavior.validationContracts.every(({ id, type, contract }) =>
						Boolean(
							id &&
							["FOCUSED", "NEGATIVE"].includes(type) &&
							contract,
						),
					),
			),
			`${touch.touchId} lacks executable focused/negative intent`,
		);
		for (const target of touch.exactSoloTargetPaths ?? []) {
			const present = existsSync(join(rootDirectory, target.path));
			assert(
				target.status === (present ? "EXISTING" : "PROPOSED"),
				`${touch.touchId} target ${target.path} status is stale`,
			);
		}
		touches.push(touch);
	}
}

const uniqueTouchIds = new Set(touches.map(({ touchId }) => touchId));
const uniquePaths = new Set(touches.map(({ path }) => path));
assert(touches.length === 64 && uniqueTouchIds.size === 64, "must bind 64 touches");
assert(uniquePaths.size === 63, "must bind 63 unique paths");
exactJson(
	countBy(touches.map(({ disposition }) => disposition)),
	{
		BOOKKEEPING_ONLY: 30,
		PORT_REQUIRED: 21,
		REJECTED: 1,
		TEST_ONLY: 12,
	},
	"touch disposition totals drifted",
);
assert(
	touches.every(({ disposition }) => disposition !== "PORTED"),
	"an audit-only ledger cannot claim behavior is already ported",
);
assert(
	touches
		.filter(({ pathType }) => pathType === "RELEASE_BOOKKEEPING")
		.every(
			({ disposition, directCopyAllowed, exactSoloTargetPaths }) =>
				disposition === "BOOKKEEPING_ONLY" &&
				directCopyAllowed === false &&
				exactSoloTargetPaths.length === 0,
		),
	"release bookkeeping is evidence only and cannot imply adoption",
);
const rejected = touches.filter(({ disposition }) => disposition === "REJECTED");
assert(
	rejected.length === 1 &&
		rejected[0].path === "playground/games/studio/src/config/config.common.ts" &&
		rejected[0].exactSoloTargetPaths.length === 0,
	"the concrete hosted Studio defaults must be rejected exactly",
);
assert(
	ledger.upstreamExactShaCiEvidence?.runId === 31594915618 &&
		ledger.upstreamExactShaCiEvidence?.conclusion === "FAILURE" &&
		ledger.upstreamExactShaCiEvidence?.workspaceAudit?.totalVulnerabilities === 69 &&
		ledger.upstreamExactShaCiEvidence?.recordingAuthority ===
			"ALLOWED_AFTER_EXACT_SHA_AND_ANCESTRY_PROOF" &&
		ledger.upstreamExactShaCiEvidence?.productAdoptionAuthority ===
			"DENIED_UNTIL_REPAIRED_AND_ALL_PRODUCT_GATES_PASS",
	"red exact-SHA source evidence or its authority boundary drifted",
);

console.log(
	"RPGJS beta.30 disposition verified: 4 exact commits, 64 path touches, 63 unique paths, 0 ported claims, and product adoption denied pending maintained-mainline repair.",
);
