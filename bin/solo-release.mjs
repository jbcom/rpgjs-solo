#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
	createHash,
	createPrivateKey,
	createPublicKey,
	randomBytes,
	sign as signBytes,
	verify as verifyBytes,
} from "node:crypto";
import {
	chmodSync,
	closeSync,
	existsSync,
	fchmodSync,
	constants as fsConstants,
	fstatSync,
	fsyncSync,
	ftruncateSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	openSync,
	readdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
	sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import { publish as publishNpmPackage } from "libnpmpublish";
import {
	inspectPortablePackageArchive,
	packPackageArchive,
} from "./package-archive-contracts.mjs";

export const rootDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
export const defaultPlanPath = join(
	rootDirectory,
	"docs/internal/releases/solo-beta29-solo2.plan.json",
);
const canonicalPlanRelativePath =
	"docs/internal/releases/solo-beta29-solo2.plan.json";
const dependencyFields = [
	"dependencies",
	"devDependencies",
	"optionalDependencies",
	"peerDependencies",
];
const canonicalMetadata = {
	repositoryUrl: "git+https://github.com/jbcom/rpgjs-solo.git",
	homepageRoot: "https://github.com/jbcom/rpgjs-solo/tree/main/",
	bugsUrl: "https://github.com/jbcom/rpgjs-solo/issues",
};
const releaseNodeVersion = "24.19.0";
const releasePnpmVersion = "11.21.0";
const fleetPatchCompatibility = new Map([
	["0.2.0", { canvasengine: "2.1.1", vite: "8.2.0" }],
	["0.3.0", { canvasengine: "2.2.0", vite: "8.2.1" }],
]);
const standardChangesetDocuments = new Set(["README.md"]);
const applyJournalName = ".rpgjs-solo-release-apply.json";
const orchestratorTrustDomain = "jbcom/rpgjs-solo-release-orchestrator";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, value) =>
	writeExclusiveFile(path, `${JSON.stringify(value, null, 2)}\n`, 0o644);
const digest = (algorithm, value) =>
	createHash(algorithm).update(value).digest("hex");
export const sha256File = (path) => digest("sha256", readFileSync(path));
export const sha512File = (path) => digest("sha512", readFileSync(path));
const sri512File = (path) =>
	`sha512-${createHash("sha512").update(readFileSync(path)).digest("base64")}`;

const assert = (condition, message) => {
	if (!condition) throw new Error(message);
};

const currentUid = () => {
	assert(
		typeof process.getuid === "function",
		"Release transactions require POSIX file ownership",
	);
	return process.getuid();
};

const lstatOrNull = (path) => {
	try {
		return lstatSync(path);
	} catch (error) {
		if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return null;
		throw error;
	}
};

const permissionMode = (stats) => stats.mode & 0o7777;

const regularFileState = (path, label, { owner, mode } = {}) => {
	let descriptor;
	try {
		descriptor = openSync(path, "r");
	} catch (error) {
		if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return null;
		throw error;
	}
	try {
		const openedStats = fstatSync(descriptor);
		const currentStats = lstatSync(path);
		assert(
			openedStats.isFile() &&
				currentStats.isFile() &&
				!currentStats.isSymbolicLink(),
			`${label} must be a regular non-symlink file`,
		);
		assert(
			openedStats.nlink === 1 && currentStats.nlink === 1,
			`${label} must have exactly one hard link`,
		);
		assert(
			openedStats.dev === currentStats.dev &&
				openedStats.ino === currentStats.ino,
			`${label} changed during no-follow inspection`,
		);
		if (owner !== undefined)
			assert(openedStats.uid === owner, `${label} has unexpected ownership`);
		if (mode !== undefined)
			assert(
				permissionMode(openedStats) === mode,
				`${label} has unexpected mode`,
			);
		const bytes = readFileSync(descriptor);
		return {
			bytes,
			sha256: digest("sha256", bytes),
			sha512: digest("sha512", bytes),
			mode: permissionMode(openedStats),
			uid: openedStats.uid,
			nlink: openedStats.nlink,
			dev: openedStats.dev,
			ino: openedStats.ino,
		};
	} finally {
		closeSync(descriptor);
	}
};

const fileStateRecord = (state) =>
	state === null
		? null
		: {
				sha256: state.sha256,
				sha512: state.sha512,
				mode: state.mode,
				uid: state.uid,
				nlink: state.nlink,
			};

const sameFileState = (left, right) =>
	left === null
		? right === null
		: right !== null &&
			left.sha512 === right.sha512 &&
			left.mode === right.mode &&
			left.uid === right.uid &&
			left.nlink === right.nlink;

const transactionTempPrefix = (path) => `.${basename(path)}.solo-txn-`;

const writeExclusiveFile = (path, value, mode) => {
	const descriptor = openSync(
		path,
		fsConstants.O_WRONLY |
			fsConstants.O_CREAT |
			fsConstants.O_EXCL |
			fsConstants.O_NOFOLLOW,
		mode,
	);
	try {
		writeFileSync(descriptor, value);
		fchmodSync(descriptor, mode);
		fsyncSync(descriptor);
	} finally {
		closeSync(descriptor);
	}
};

const rewriteOwnedFile = (path, value, mode, label) => {
	const descriptor = openSync(path, "r+");
	try {
		const opened = fstatSync(descriptor);
		const current = lstatSync(path);
		assert(
			opened.isFile() &&
				current.isFile() &&
				!current.isSymbolicLink() &&
				opened.dev === current.dev &&
				opened.ino === current.ino &&
				opened.uid === currentUid() &&
				opened.nlink === 1,
			`${label} changed during no-follow rewrite`,
		);
		ftruncateSync(descriptor, 0);
		writeFileSync(descriptor, value);
		fchmodSync(descriptor, mode);
		fsyncSync(descriptor);
	} finally {
		closeSync(descriptor);
	}
};

const ensureExactFile = (path, value, mode, label) => {
	const expected = Buffer.isBuffer(value) ? value : Buffer.from(value);
	const existing = regularFileState(path, label, {
		owner: currentUid(),
		mode,
	});
	if (existing) {
		assert(existing.bytes.equals(expected), `${label} has foreign bytes`);
		return existing;
	}
	writeExclusiveFile(path, expected, mode);
	const created = regularFileState(path, label, {
		owner: currentUid(),
		mode,
	});
	assert(created?.bytes.equals(expected), `${label} creation was not durable`);
	return created;
};

const removeOwnedTempDirectory = (path) => {
	const stats = lstatSync(path);
	assert(
		stats.isDirectory() &&
			!stats.isSymbolicLink() &&
			stats.uid === currentUid() &&
			permissionMode(stats) === 0o700,
		"Transaction temporary path is not an owned mode-0700 directory",
	);
	const names = readdirSync(path).sort();
	assert(
		names.every((name) => ["owner.json", "payload"].includes(name)),
		"Transaction temporary directory contains an unexpected entry",
	);
	for (const name of names) {
		const child = join(path, name);
		const childStats = lstatSync(child);
		assert(
			childStats.isFile() &&
				!childStats.isSymbolicLink() &&
				childStats.uid === currentUid() &&
				childStats.nlink === 1,
			"Transaction temporary directory contains a non-regular entry",
		);
		rmSync(child);
	}
	rmdirSync(path);
};

const recoverTransactionTemps = (path, value, mode, purpose) => {
	const desired = Buffer.isBuffer(value) ? value : Buffer.from(value);
	const desiredSha512 = digest("sha512", desired);
	const parent = dirname(path);
	const prefix = transactionTempPrefix(path);
	for (const name of readdirSync(parent).filter((entry) =>
		entry.startsWith(prefix),
	)) {
		const directory = join(parent, name);
		const directoryStats = lstatSync(directory);
		assert(
			directoryStats.isDirectory() &&
				!directoryStats.isSymbolicLink() &&
				directoryStats.uid === currentUid() &&
				permissionMode(directoryStats) === 0o700,
			"Transaction temporary path is forged or unsafe",
		);
		const markerPath = join(directory, "owner.json");
		const payloadPath = join(directory, "payload");
		const markerStats = lstatOrNull(markerPath);
		const payloadStats = lstatOrNull(payloadPath);
		for (const stats of [markerStats, payloadStats].filter(Boolean))
			assert(
				stats.isFile() &&
					!stats.isSymbolicLink() &&
					stats.uid === currentUid() &&
					stats.nlink === 1,
				"Transaction temporary entry is forged or unsafe",
			);
		assert(markerStats, "Unmarked transaction temporary state was preserved");
		const names = readdirSync(directory).sort();
		assert(
			JSON.stringify(names) === JSON.stringify(["owner.json", "payload"]) ||
				JSON.stringify(names) === JSON.stringify(["owner.json"]),
			"Unverifiable transaction temporary state was preserved",
		);
		assert(
			permissionMode(markerStats) === 0o600,
			"Transaction ownership marker has unexpected mode",
		);
		const markerState = regularFileState(
			markerPath,
			"Transaction ownership marker",
			{ owner: currentUid(), mode: 0o600 },
		);
		const marker = JSON.parse(markerState.bytes.toString("utf8"));
		assert(
			marker.schemaVersion === 1 &&
				marker.target === basename(path) &&
				marker.purpose === purpose &&
				typeof marker.payloadSha512 === "string" &&
				Number.isInteger(marker.mode) &&
				(marker.previous === null ||
					(typeof marker.previous?.sha512 === "string" &&
						Number.isInteger(marker.previous?.mode) &&
						Number.isInteger(marker.previous?.uid) &&
						marker.previous?.nlink === 1)),
			"Transaction ownership marker drifted",
		);
		assert(
			marker.payloadSha512 === desiredSha512 && marker.mode === mode,
			"Transaction temporary state belongs to different desired bytes",
		);
		const current = regularFileState(path, "Transaction target");
		if (!payloadStats) {
			assert(
				current?.sha512 === marker.payloadSha512 &&
					current.mode === marker.mode,
				"Transaction payload disappeared before commit",
			);
			removeOwnedTempDirectory(directory);
			continue;
		}
		assert(
			permissionMode(payloadStats) === marker.mode &&
				regularFileState(payloadPath, "Transaction temporary payload", {
					owner: currentUid(),
					mode: marker.mode,
				}).sha512 === marker.payloadSha512,
			"Transaction temporary payload drifted",
		);
		assert(
			sameFileState(current, marker.previous),
			"Transaction target changed after its temporary payload was prepared",
		);
		renameSync(payloadPath, path);
		removeOwnedTempDirectory(directory);
	}
};

export const secureAtomicWriteFile = (
	path,
	value,
	{ mode = 0o600, purpose, beforeRename = () => {} },
) => {
	assert(
		typeof purpose === "string" && purpose.length > 0,
		"Secure write purpose is required",
	);
	recoverTransactionTemps(path, value, mode, purpose);
	const desired = Buffer.isBuffer(value) ? value : Buffer.from(value);
	const desiredSha512 = digest("sha512", desired);
	const previousState = regularFileState(path, "Transaction target");
	const previous = fileStateRecord(previousState);
	if (previous?.sha512 === desiredSha512 && previous.mode === mode) return;
	const parent = dirname(path);
	let directory;
	for (let attempt = 0; attempt < 8 && !directory; attempt += 1) {
		const candidate = join(
			parent,
			`${transactionTempPrefix(path)}${randomBytes(24).toString("hex")}`,
		);
		try {
			mkdirSync(candidate, { mode: 0o700 });
			chmodSync(candidate, 0o700);
			directory = candidate;
		} catch (error) {
			if (error?.code !== "EEXIST") throw error;
		}
	}
	assert(
		directory,
		"Unable to allocate an exclusive transaction temporary directory",
	);
	const payloadPath = join(directory, "payload");
	const markerPath = join(directory, "owner.json");
	writeExclusiveFile(payloadPath, desired, mode);
	writeExclusiveFile(
		markerPath,
		`${JSON.stringify(
			{
				schemaVersion: 1,
				target: basename(path),
				purpose,
				payloadSha512: desiredSha512,
				mode,
				previous,
			},
			null,
			2,
		)}\n`,
		0o600,
	);
	beforeRename({ path, directory, payloadPath, markerPath });
	assert(
		sameFileState(regularFileState(path, "Transaction target"), previous),
		"Transaction target changed before atomic rename",
	);
	renameSync(payloadPath, path);
	removeOwnedTempDirectory(directory);
};

export const secureAtomicWriteJson = (path, value, options) =>
	secureAtomicWriteFile(path, `${JSON.stringify(value, null, 2)}\n`, options);

export const readTransactionJournal = (path, purpose) => {
	assert(
		typeof purpose === "string" && purpose.length > 0,
		"Journal purpose is required",
	);
	const state = regularFileState(path, `${purpose} journal`, {
		owner: currentUid(),
		mode: 0o600,
	});
	assert(state, `${purpose} journal is missing`);
	return JSON.parse(state.bytes.toString("utf8"));
};

export const normalizeCommandOutput = (output, trim = true) => {
	const text = output ?? "";
	return trim ? text.trim() : text;
};

const run = (command, args, options = {}) => {
	const output = execFileSync(command, args, {
		cwd: options.cwd ?? rootDirectory,
		encoding: "utf8",
		stdio: options.stdio ?? "pipe",
		env: options.env ?? process.env,
		timeout: options.timeout ?? 300_000,
		maxBuffer: 32 * 1024 * 1024,
	});
	return normalizeCommandOutput(output, options.trim !== false);
};

export const assertReleaseToolchain = (
	command = run,
	nodeVersion = process.versions.node,
	nodeExecPath = process.execPath,
) => {
	assert(
		nodeVersion === releaseNodeVersion,
		`Solo release requires Node ${releaseNodeVersion}; received ${nodeVersion}`,
	);
	const pnpmVersion = command("pnpm", ["--version"]);
	assert(
		pnpmVersion === releasePnpmVersion,
		`Solo release requires pnpm ${releasePnpmVersion}; received ${pnpmVersion}`,
	);
	const childNode = JSON.parse(
		command("pnpm", [
			"exec",
			"node",
			"-p",
			"JSON.stringify({version:process.versions.node,execPath:process.execPath})",
		]),
	);
	assert(
		childNode.version === releaseNodeVersion &&
			realpathSync(childNode.execPath) === realpathSync(nodeExecPath),
		`Solo release pnpm child runtime must be the exact Node ${releaseNodeVersion} CLI runtime; received ${childNode.version} at ${childNode.execPath}`,
	);
	return {
		nodeVersion,
		nodeExecPath: realpathSync(nodeExecPath),
		pnpmVersion,
		childNodeVersion: childNode.version,
		childNodeExecPath: realpathSync(childNode.execPath),
	};
};

const parseVersion = (version) => {
	const match = /^(\d+\.\d+\.\d+-beta\.\d+)\.solo\.(\d+)$/.exec(version);
	assert(match, `Invalid Solo version ${version}`);
	return { upstream: match[1], counter: Number(match[2]) };
};

const soloVersionTuple = (version) => {
	const match = /^(\d+)\.(\d+)\.(\d+)-beta\.(\d+)\.solo\.(\d+)$/.exec(
		String(version),
	);
	assert(match, `Invalid live Solo version ${version}`);
	return match.slice(1).map(Number);
};

const compareSoloVersions = (left, right) => {
	const leftParts = soloVersionTuple(left);
	const rightParts = soloVersionTuple(right);
	for (let index = 0; index < leftParts.length; index += 1) {
		if (leftParts[index] !== rightParts[index])
			return leftParts[index] - rightParts[index];
	}
	return 0;
};

export const assertMonotonicLatestPromotion = (currentLatest, target) => {
	if (currentLatest === null || currentLatest === undefined) return;
	assert(
		currentLatest === target || compareSoloVersions(target, currentLatest) > 0,
		`Refusing to move latest backward from ${currentLatest} to ${target}`,
	);
};

export const parseChangeset = (source, id = "<changeset>") => {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(source);
	assert(match, `${id} has an invalid changeset document`);
	const releases = [];
	for (const line of match[1].split(/\r?\n/).filter(Boolean)) {
		const field = /^['"]([^'"]+)['"]:\s*(major|minor|patch)$/.exec(line.trim());
		assert(field, `${id} has an invalid release declaration: ${line}`);
		releases.push({ name: field[1], type: field[2] });
	}
	assert(releases.length > 0, `${id} has no release declarations`);
	return { releases, summary: match[2].trim() };
};

export const loadSoloReleasePlan = (planPath = defaultPlanPath) => {
	const planState = regularFileState(planPath, "Solo release plan");
	assert(planState, "Solo release plan is missing");
	const plan = JSON.parse(planState.bytes.toString("utf8"));
	assert(plan.schemaVersion === 2, "Unsupported Solo release plan schema");
	const previous = parseVersion(plan.previousVersion);
	const target = parseVersion(plan.version);
	assert(
		previous.upstream === target.upstream &&
			target.counter === previous.counter + 1,
		"The target must retain the same upstream beta baseline and increment the Solo counter exactly once",
	);
	assert(
		plan.packages.length === 4,
		"The Solo release cohort must contain exactly four packages",
	);
	assert(
		new Set(plan.packages.map(({ name }) => name)).size === 4,
		"Duplicate Solo package",
	);
	assert(
		/^[0-9a-f]{40}$/.test(plan.sourceBaseCommit) &&
			/^[0-9a-f]{40}$/.test(plan.requiredSourceCommit),
		"Source commits must be immutable",
	);
	assert(
		["provisional", "final"].includes(plan.sourceBinding?.status),
		"Source binding status must be provisional or final",
	);
	if (plan.sourceBinding.status === "final")
		assert(
			plan.sourceBaseCommit === plan.requiredSourceCommit,
			"Final source base and required source must bind the same canonical merge",
		);
	assert(
		/^[0-9a-f]{40}$/.test(plan.upstreamCommit),
		"upstreamCommit must be immutable",
	);
	assert(
		plan.registry === "https://git.local.jonbogaty.com/api/packages/jbcom/npm/",
		"Solo registry must be the documented Gitea registry",
	);
	assert(
		plan.canonical?.repository === "https://github.com/jbcom/rpgjs-solo.git" &&
			plan.canonical.branch === "main",
		"GitHub main must remain canonical",
	);
	assert(
		plan.candidateDistTag !== plan.promotionDistTag &&
			plan.promotionDistTag === "latest",
		"Candidate and promotion tags must remain distinct",
	);
	assert(
		plan.trainTag === `solo-v${plan.version}`,
		"Train tag does not encode the exact version",
	);
	const expectedPackages = [
		{
			name: "@jbcom/rpgjs-solo",
			directory: "packages/solo",
			tag: `rpgjs-solo-v${plan.version}`,
		},
		{
			name: "@jbcom/rpgjs-solo-action-battle",
			directory: "packages/solo-action-battle",
			tag: `rpgjs-solo-action-battle-v${plan.version}`,
		},
		{
			name: "@jbcom/rpgjs-solo-renderer",
			directory: "packages/solo-renderer",
			tag: `rpgjs-solo-renderer-v${plan.version}`,
		},
		{
			name: "@jbcom/rpgjs-solo-vite",
			directory: "packages/solo-vite",
			tag: `rpgjs-solo-vite-v${plan.version}`,
		},
	];
	assert(
		plan.packages.every(
			(record, index) =>
				record.name === expectedPackages[index].name &&
				record.directory === expectedPackages[index].directory &&
				record.tag === expectedPackages[index].tag,
		),
		"Solo package order, directory, or immutable tag drifted",
	);
	const releaseInputs = [...plan.consumedChangesets, ...plan.carriedChangesets];
	assert(
		new Set(releaseInputs.map(({ id }) => id)).size === releaseInputs.length &&
			releaseInputs.every(
				({ id, sha256, introducedBy }) =>
					/^[a-z0-9][a-z0-9-]*$/.test(id) &&
					/^[0-9a-f]{64}$/.test(sha256) &&
					(introducedBy === undefined || /^[0-9a-f]{40}$/.test(introducedBy)),
			),
		"Release changeset identities must be unique and hash-bound",
	);
	const studioCarry = plan.carriedChangesets.find(
		({ id }) => id === "fair-studio-success-rates",
	);
	if (studioCarry) {
		assert(
			/^[0-9a-f]{40}$/.test(studioCarry.introducedBy),
			"The post-review Studio carry input must name its immutable introducing commit",
		);
	}
	assert(
		Array.isArray(plan.inheritedReleaseDirectories) &&
			plan.inheritedReleaseDirectories.length > 0 &&
			new Set(plan.inheritedReleaseDirectories).size ===
				plan.inheritedReleaseDirectories.length &&
			plan.inheritedReleaseDirectories.every(
				(directory) =>
					typeof directory === "string" &&
					directory.startsWith("packages/") &&
					!directory.includes(".."),
			),
		"Inherited release directories must be unique package paths",
	);
	assert(
		plan.requiredConsumer?.package === "@arcade-cabinet/rpgjs-patches" &&
			fleetPatchCompatibility.has(plan.requiredConsumer.version),
		"The release plan must name a supported exact fleet compatibility consumer",
	);
	assert(
		["provisional", "final"].includes(plan.reviewEvidence?.status),
		"Review evidence status must be provisional or final",
	);
	const engineReview = plan.reviewEvidence?.enginePullRequest;
	const releaseReview = plan.reviewEvidence?.releasePullRequest;
	const independentReceipt = plan.reviewEvidence?.independentReceipt;
	const assignment = independentReceipt?.orchestratorAssignment;
	assert(
		engineReview?.repository === "jbcom/rpgjs-solo" &&
			Number.isInteger(engineReview.number) &&
			engineReview.number > 0 &&
			/^[0-9a-f]{40}$/.test(engineReview.mergeCommit) &&
			engineReview.mergeCommit === plan.requiredSourceCommit &&
			Array.isArray(engineReview.requiredChecks) &&
			Number.isInteger(engineReview.minimumApprovals) &&
			engineReview.minimumApprovals >= 1,
		"Engine pull-request review evidence is incomplete",
	);
	assert(
		releaseReview?.repository === "jbcom/rpgjs-solo" &&
			(releaseReview.number === null ||
				Number.isInteger(releaseReview.number)) &&
			Array.isArray(releaseReview.requiredChecks) &&
			Number.isInteger(releaseReview.minimumApprovals) &&
			releaseReview.minimumApprovals >= 1 &&
			releaseReview.mergeCommitBinding === "canonical-head",
		"Release pull-request review evidence is incomplete",
	);
	assert(
		["provisional", "final"].includes(independentReceipt?.status) &&
			independentReceipt?.algorithm === "ed25519" &&
			["provisional", "final"].includes(assignment?.status) &&
			assignment?.schemaVersion === 1 &&
			assignment?.trustRootPathEnvironment ===
				"RPGJS_SOLO_ORCHESTRATOR_TRUST_ROOT_PATH" &&
			assignment?.trustRootKeyIdEnvironment ===
				"RPGJS_SOLO_ORCHESTRATOR_TRUST_ROOT_KEY_ID" &&
			assignment?.assignmentPathEnvironment ===
				"RPGJS_SOLO_ORCHESTRATOR_ASSIGNMENT_PATH" &&
			assignment?.requiredReviewerRole === "independent-release-auditor",
		"Independent review receipt configuration is incomplete",
	);
	for (const field of [
		"keyId",
		"publicKeyPem",
		"producerTaskId",
		"producerPrincipalId",
		"reviewerTaskId",
		"reviewerPrincipalId",
		"reviewerForkId",
		"reviewerKeyId",
		"reviewerPublicKeyPem",
		"assignmentSha512",
	])
		assert(
			independentReceipt[field] === undefined &&
				assignment[field] === undefined,
			`Release plan must not select orchestrator trust input ${field}`,
		);
	if (plan.reviewEvidence.status === "final") {
		assert(
			plan.sourceBinding.status === "final" &&
				engineReview.mergeCommit === plan.requiredSourceCommit &&
				Number.isInteger(releaseReview.number) &&
				independentReceipt.status === "final" &&
				assignment.status === "final" &&
				plan.provenanceAttestation?.status === "final",
			"Final review evidence must bind the engine merge and release pull request",
		);
	}
	assert(
		["provisional", "final"].includes(plan.provenanceAttestation?.status) &&
			plan.provenanceAttestation?.algorithm === "ed25519",
		"Provenance attestation configuration is incomplete",
	);
	if (plan.provenanceAttestation.status === "final") {
		assert(
			typeof plan.provenanceAttestation.keyId === "string" &&
				/^[0-9a-f]{64}$/.test(plan.provenanceAttestation.keyId) &&
				typeof plan.provenanceAttestation.publicKeyPem === "string",
			"Final provenance attestation requires an Ed25519 public key",
		);
		const publicKey = createPublicKey(plan.provenanceAttestation.publicKeyPem);
		const keyId = digest(
			"sha256",
			publicKey.export({ type: "spki", format: "der" }),
		);
		assert(
			publicKey.asymmetricKeyType === "ed25519" &&
				keyId === plan.provenanceAttestation.keyId,
			"Provenance attestation key id does not match its public key",
		);
	}
	return { ...plan, planPath, planSha512: planState.sha512 };
};

export const assertReviewedPlanSource = (
	plan,
	planPath = defaultPlanPath,
	root = rootDirectory,
	command = run,
) => {
	const canonicalPath = join(root, canonicalPlanRelativePath);
	assert(
		resolve(planPath) === canonicalPath &&
			resolve(plan.planPath) === canonicalPath,
		"Production release commands require the canonical reviewed plan path",
	);
	const planState = regularFileState(
		canonicalPath,
		"Canonical Solo release plan",
	);
	assert(planState, "Canonical Solo release plan is missing");
	const headBytes = Buffer.from(
		command("git", ["show", `HEAD:${canonicalPlanRelativePath}`], {
			cwd: root,
			trim: false,
		}),
	);
	assert(
		planState.bytes.equals(headBytes) &&
			plan.planSha512 === digest("sha512", headBytes),
		"Solo release plan bytes do not match the exact reviewed HEAD blob",
	);
	return {
		path: canonicalPath,
		sha512: planState.sha512,
	};
};

export const assertFinalReleaseBindings = (plan) => {
	const bindings = {
		sourceBinding: plan.sourceBinding?.status,
		reviewEvidence: plan.reviewEvidence?.status,
		independentReceipt: plan.reviewEvidence?.independentReceipt?.status,
		orchestratorAssignment:
			plan.reviewEvidence?.independentReceipt?.orchestratorAssignment?.status,
		provenanceAttestation: plan.provenanceAttestation?.status,
	};
	const provisional = Object.entries(bindings)
		.filter(([, status]) => status !== "final")
		.map(([name]) => name);
	assert(
		provisional.length === 0,
		`Release bindings are not final: ${provisional.join(", ")}`,
	);
	return bindings;
};

const walkPackageJson = (directory, results = []) => {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (
			[".git", "node_modules", "dist", ".turbo", ".vite"].includes(entry.name)
		)
			continue;
		const path = join(directory, entry.name);
		if (entry.isDirectory()) walkPackageJson(path, results);
		else if (entry.name === "package.json") results.push(path);
	}
	return results;
};

const pendingChangesetIds = (root) => {
	const prePath = join(root, ".changeset/pre.json");
	const preConsumed = existsSync(prePath)
		? new Set(readJson(prePath).changesets ?? [])
		: new Set();
	return readdirSync(join(root, ".changeset"))
		.filter(
			(name) =>
				name.endsWith(".md") &&
				!standardChangesetDocuments.has(name) &&
				!preConsumed.has(name.slice(0, -3)),
		)
		.map((name) => name.slice(0, -3));
};

const checkChangeset = (root, entry) => {
	const path = join(root, ".changeset", `${entry.id}.md`);
	assert(existsSync(path), `Required changeset ${entry.id} is missing`);
	assert(
		sha256File(path) === entry.sha256,
		`${entry.id} SHA-256 does not match the release plan`,
	);
	return parseChangeset(readFileSync(path, "utf8"), entry.id);
};

const deriveReleaseRelevantPackages = (root, plan) => {
	const names = new Set(plan.packages.map(({ name }) => name));
	for (const directory of plan.inheritedReleaseDirectories) {
		const path = join(root, directory, "package.json");
		assert(
			existsSync(path),
			`Release surface package is missing: ${directory}`,
		);
		const manifest = readJson(path);
		assert(
			typeof manifest.name === "string" && manifest.name.startsWith("@rpgjs/"),
			`${directory} is not an inherited RPGJS package`,
		);
		names.add(manifest.name);
	}
	return names;
};

const assertPackageMetadata = (record, manifest, plan) => {
	assert(
		manifest.name === record.name,
		`${record.directory} package identity drifted`,
	);
	assert(manifest.private !== true, `${record.name} is not publishable`);
	assert(
		manifest.engines?.node === ">=24 <25",
		`${record.name} must require Node 24`,
	);
	assert(
		manifest.publishConfig?.registry === plan.registry,
		`${record.name} registry drifted`,
	);
	assert(
		manifest.repository?.type === "git",
		`${record.name} repository type drifted`,
	);
	assert(
		manifest.repository?.url === canonicalMetadata.repositoryUrl,
		`${record.name} repository URL drifted`,
	);
	assert(
		manifest.repository?.directory === record.directory,
		`${record.name} repository directory drifted`,
	);
	assert(
		manifest.homepage ===
			`${canonicalMetadata.homepageRoot}${record.directory}#readme`,
		`${record.name} homepage drifted`,
	);
	assert(
		manifest.bugs?.url === canonicalMetadata.bugsUrl,
		`${record.name} bugs URL drifted`,
	);
};

export const validateSoloReleaseState = (root, plan) => {
	const cohort = new Set(plan.packages.map(({ name }) => name));
	const releaseRelevantPackages = deriveReleaseRelevantPackages(root, plan);
	const manifests = plan.packages.map((record) => {
		const manifest = readJson(join(root, record.directory, "package.json"));
		assertPackageMetadata(record, manifest, plan);
		return { record, manifest };
	});
	const sourceCount = manifests.filter(
		({ manifest }) => manifest.version === plan.previousVersion,
	).length;
	const appliedCount = manifests.filter(
		({ manifest }) => manifest.version === plan.version,
	).length;
	assert(
		sourceCount === plan.packages.length ||
			appliedCount === plan.packages.length,
		"Solo packages are in a mixed release phase or have an undeclared version",
	);
	const phase = sourceCount === plan.packages.length ? "source" : "applied";

	const parsedConsumed = new Map();
	for (const entry of plan.consumedChangesets) {
		const path = join(root, ".changeset", `${entry.id}.md`);
		if (phase === "source")
			parsedConsumed.set(entry.id, checkChangeset(root, entry));
		else
			assert(
				!existsSync(path),
				`Applied release still contains consumed changeset ${entry.id}`,
			);
	}
	const parsedCarried = new Map();
	for (const entry of plan.carriedChangesets)
		parsedCarried.set(entry.id, checkChangeset(root, entry));

	for (const [id, changeset] of parsedConsumed) {
		const foreign = changeset.releases.filter(({ name }) => !cohort.has(name));
		assert(
			foreign.length === 0,
			`${id} names non-Solo package ${foreign[0]?.name}`,
		);
	}

	const declared = new Set([
		...(phase === "source" ? plan.consumedChangesets.map(({ id }) => id) : []),
		...plan.carriedChangesets.map(({ id }) => id),
	]);
	const relevantPending = pendingChangesetIds(root).filter((id) => {
		const parsed = parseChangeset(
			readFileSync(join(root, ".changeset", `${id}.md`), "utf8"),
			id,
		);
		return parsed.releases.some(({ name }) =>
			releaseRelevantPackages.has(name),
		);
	});
	const undeclared = relevantPending.filter((id) => !declared.has(id));
	assert(
		undeclared.length === 0,
		`Undeclared release-relevant changeset: ${undeclared.join(", ")}`,
	);
	const declaredMissing = [...declared].filter(
		(id) => !relevantPending.includes(id),
	);
	assert(
		declaredMissing.length === 0,
		`Declared release input is not pending/relevant: ${declaredMissing.join(", ")}`,
	);

	const expectedWorkspace = `workspace:${phase === "source" ? plan.previousVersion : plan.version}`;
	for (const path of walkPackageJson(root)) {
		const manifest = readJson(path);
		for (const field of dependencyFields) {
			for (const [name, version] of Object.entries(manifest[field] ?? {})) {
				if (cohort.has(name)) {
					assert(
						version === expectedWorkspace,
						`${relative(root, path)} has non-exact Solo workspace reference ${name}@${version}`,
					);
				}
			}
		}
	}
	return {
		phase,
		pendingChangesets: [...parsedConsumed.keys()],
		carriedChangesets: [...parsedCarried.keys()],
	};
};

const changelogEntry = (record, plan, changesets, previous = null) => {
	const notes = changesets
		.filter(([, parsed]) =>
			parsed.releases.some(({ name }) => name === record.name),
		)
		.map(([id, parsed]) => `- ${parsed.summary}\n  (${id})`)
		.join("\n");
	const header = `# ${record.name}\n\n`;
	const section = `## ${plan.version}\n\n${notes}\n`;
	if (previous === null) return `${header}${section}`;
	assert(
		previous.startsWith(header),
		`${record.name} changelog does not have the canonical package heading`,
	);
	assert(
		!previous.includes(`\n## ${plan.version}\n`),
		`${record.name} changelog already contains ${plan.version}`,
	);
	return `${header}${section}\n${previous.slice(header.length)}`;
};

const assertReleaseCommitAncestry = (root, plan, head, command = run) => {
	assert(
		plan.sourceBinding.status === "final",
		"Replace both provisional source bindings with the exact PR merge commit before release execution",
	);
	assert(
		plan.reviewEvidence.status === "final",
		"Replace provisional review evidence with the exact engine and release pull-request bindings",
	);
	command(
		"git",
		[
			"merge-base",
			"--is-ancestor",
			plan.sourceBaseCommit,
			plan.requiredSourceCommit,
		],
		{ cwd: root },
	);
	for (const entry of plan.carriedChangesets) {
		if (!entry.introducedBy) continue;
		command(
			"git",
			[
				"merge-base",
				"--is-ancestor",
				entry.introducedBy,
				plan.requiredSourceCommit,
			],
			{ cwd: root },
		);
	}
	command(
		"git",
		["merge-base", "--is-ancestor", plan.requiredSourceCommit, head],
		{ cwd: root },
	);
	command("git", ["merge-base", "--is-ancestor", plan.upstreamCommit, head], {
		cwd: root,
	});
};

const successfulCheckNames = (checks) =>
	new Set(
		(checks ?? [])
			.filter(
				(check) =>
					check?.conclusion === "SUCCESS" || check?.state === "SUCCESS",
			)
			.map((check) => check.name ?? check.context)
			.filter((name) => typeof name === "string"),
	);

export const assertPullRequestReviewEvidence = ({
	record,
	expectedMergeCommit,
	command = run,
}) => {
	const pullRequest = JSON.parse(
		command(
			"gh",
			[
				"pr",
				"view",
				String(record.number),
				"-R",
				record.repository,
				"--json",
				"state,isDraft,baseRefName,baseRefOid,headRefOid,mergeCommit,reviewDecision,reviews,statusCheckRollup",
			],
			{ timeout: 600_000 },
		),
	);
	assert(
		pullRequest.state === "MERGED" && pullRequest.isDraft === false,
		`Pull request #${record.number} is not a merged ready review`,
	);
	assert(
		pullRequest.baseRefName === "main" &&
			pullRequest.mergeCommit?.oid === expectedMergeCommit,
		`Pull request #${record.number} does not bind the expected main merge`,
	);
	const approvalCount = (pullRequest.reviews ?? []).filter(
		({ state }) => state === "APPROVED",
	).length;
	const githubApproved =
		pullRequest.reviewDecision === "APPROVED" &&
		approvalCount >= record.minimumApprovals;
	const passed = successfulCheckNames(pullRequest.statusCheckRollup);
	const missingChecks = record.requiredChecks.filter(
		(name) => !passed.has(name),
	);
	assert(
		missingChecks.length === 0,
		`Pull request #${record.number} is missing successful checks: ${missingChecks.join(", ")}`,
	);
	const [owner, repository] = record.repository.split("/");
	const threadResult = JSON.parse(
		command(
			"gh",
			[
				"api",
				"graphql",
				"-F",
				`owner=${owner}`,
				"-F",
				`repository=${repository}`,
				"-F",
				`number=${record.number}`,
				"-f",
				"query=query($owner:String!,$repository:String!,$number:Int!){repository(owner:$owner,name:$repository){pullRequest(number:$number){reviewThreads(first:100){nodes{isResolved}pageInfo{hasNextPage}}}}}",
			],
			{ timeout: 600_000 },
		),
	);
	const threads = threadResult.data?.repository?.pullRequest?.reviewThreads;
	assert(
		threads,
		`Pull request #${record.number} review threads are unavailable`,
	);
	assert(
		threads.pageInfo?.hasNextPage === false,
		`Pull request #${record.number} has more review threads than the verifier can attest`,
	);
	assert(
		threads.nodes.every(({ isResolved }) => isResolved === true),
		`Pull request #${record.number} has unresolved review threads`,
	);
	return {
		number: record.number,
		baseCommit: pullRequest.baseRefOid,
		headCommit: pullRequest.headRefOid,
		mergeCommit: expectedMergeCommit,
		checks: [...passed].sort(),
		approvals: approvalCount,
		githubApproved,
		resolvedThreads: threads.nodes.length,
	};
};

const pathIsInside = (parent, candidate) => {
	const location = relative(resolve(parent), resolve(candidate));
	return (
		location === "" || (!location.startsWith(`..${sep}`) && location !== "..")
	);
};

const decodeCanonicalBase64 = (value, length, label) => {
	assert(
		typeof value === "string" && /^[A-Za-z0-9+/]*={0,2}$/.test(value),
		`${label} is not canonical base64`,
	);
	const bytes = Buffer.from(value, "base64");
	assert(
		bytes.length === length && bytes.toString("base64") === value,
		`${label} is not canonical base64`,
	);
	return bytes;
};

const ed25519PublicKeyFromRaw = (bytes) =>
	createPublicKey({
		key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), bytes]),
		format: "der",
		type: "spki",
	});

const parseExternalTrustRoot = (trustRoot, pinnedKeyId) => {
	if (trustRoot.schemaVersion === "arcade-cabinet.orchestrator-trust-root/v1") {
		const raw = decodeCanonicalBase64(
			trustRoot.publicKey?.value,
			32,
			"Orchestrator raw public key",
		);
		const keyId = digest("sha256", raw);
		assert(
			trustRoot.trustRootId ===
				"arcade-cabinet-orchestrator-assignment-ed25519-v1" &&
				trustRoot.status === "ACTIVE" &&
				trustRoot.normativeArtifact === true &&
				trustRoot.scope?.includes(
					"jbcom-rpgjs-solo-release-review-assignment",
				) &&
				trustRoot.publicKey?.algorithm === "Ed25519" &&
				trustRoot.publicKey?.encoding ===
					"raw-base64-rfc4648-canonical-with-padding" &&
				trustRoot.publicKey?.rawBytes === 32 &&
				trustRoot.publicKey?.sha256 === keyId &&
				keyId === pinnedKeyId,
			"External arcade-cabinet orchestrator trust root does not match its raw-key fingerprint pin",
		);
		return { key: ed25519PublicKeyFromRaw(raw), keyId, representation: "raw" };
	}
	const key = createPublicKey(trustRoot.publicKeyPem);
	const keyId = digest("sha256", key.export({ type: "spki", format: "der" }));
	assert(
		trustRoot.schemaVersion === 1 &&
			trustRoot.trustDomain === orchestratorTrustDomain &&
			trustRoot.algorithm === "ed25519" &&
			key.asymmetricKeyType === "ed25519" &&
			trustRoot.keyId === keyId &&
			keyId === pinnedKeyId,
		"External orchestrator trust root does not match its runtime fingerprint pin",
	);
	return { key, keyId, representation: "spki" };
};

export const verifyExternalOrchestratorAssignment = (
	plan,
	{ env = process.env, repositoryRoot = rootDirectory } = {},
) => {
	const policy =
		plan.reviewEvidence?.independentReceipt?.orchestratorAssignment;
	assert(
		plan.reviewEvidence?.independentReceipt?.status === "final" &&
			policy?.status === "final",
		"A final external orchestrator assignment policy is required",
	);
	const trustRootPath = env[policy.trustRootPathEnvironment];
	const pinnedTrustRootKeyId = env[policy.trustRootKeyIdEnvironment];
	const assignmentPath = env[policy.assignmentPathEnvironment];
	assert(
		trustRootPath && isAbsolute(trustRootPath),
		`${policy.trustRootPathEnvironment} must name an absolute external trust root`,
	);
	assert(
		assignmentPath && isAbsolute(assignmentPath),
		`${policy.assignmentPathEnvironment} must name an absolute detached assignment`,
	);
	assert(
		/^[0-9a-f]{64}$/.test(pinnedTrustRootKeyId ?? ""),
		`${policy.trustRootKeyIdEnvironment} must pin the orchestrator key fingerprint`,
	);
	for (const path of [trustRootPath, assignmentPath, `${assignmentPath}.sig`])
		assert(
			!pathIsInside(repositoryRoot, path),
			"Orchestrator trust inputs must be supplied outside the producer repository",
		);
	const trustRootState = regularFileState(
		trustRootPath,
		"Orchestrator trust root",
		{ owner: currentUid(), mode: 0o600 },
	);
	const assignmentState = regularFileState(
		assignmentPath,
		"Detached orchestrator assignment",
		{ owner: currentUid(), mode: 0o600 },
	);
	const signatureState = regularFileState(
		`${assignmentPath}.sig`,
		"Detached orchestrator assignment signature",
		{ owner: currentUid(), mode: 0o600 },
	);
	assert(
		trustRootState && assignmentState && signatureState,
		"External orchestrator trust root, assignment, or signature is missing",
	);
	const repositoryRealRoot = realpathSync(repositoryRoot);
	for (const path of [trustRootPath, assignmentPath, `${assignmentPath}.sig`])
		assert(
			!pathIsInside(repositoryRealRoot, realpathSync(path)),
			"Orchestrator trust inputs must resolve outside the producer repository",
		);
	const trustRoot = JSON.parse(trustRootState.bytes.toString("utf8"));
	const parsedTrustRoot = parseExternalTrustRoot(
		trustRoot,
		pinnedTrustRootKeyId,
	);
	const trustRootKey = parsedTrustRoot.key;
	const trustRootKeyId = parsedTrustRoot.keyId;
	const assignment = JSON.parse(assignmentState.bytes.toString("utf8"));
	assert(
		assignment.schemaVersion === 1 &&
			assignment.algorithm === "ed25519" &&
			assignment.trustRootKeyId === trustRootKeyId &&
			assignment.releaseId === plan.releaseId &&
			assignment.version === plan.version &&
			[
				assignment.producerTaskId,
				assignment.producerPrincipalId,
				assignment.reviewerTaskId,
				assignment.reviewerPrincipalId,
				assignment.reviewerForkId,
			].every((value) => typeof value === "string" && value.length > 0) &&
			assignment.reviewerRole === policy.requiredReviewerRole &&
			assignment.producerTaskId !== assignment.reviewerTaskId &&
			assignment.producerTaskId !== assignment.reviewerForkId &&
			assignment.producerPrincipalId !== assignment.reviewerPrincipalId,
		"Detached orchestrator assignment does not bind the exact producer-disjoint release",
	);
	const reviewerPublicKey = createPublicKey(assignment.reviewerPublicKeyPem);
	const reviewerKeyId = digest(
		"sha256",
		reviewerPublicKey.export({ type: "spki", format: "der" }),
	);
	assert(
		reviewerPublicKey.asymmetricKeyType === "ed25519" &&
			assignment.reviewerKeyId === reviewerKeyId &&
			reviewerKeyId !== plan.provenanceAttestation.keyId,
		"Detached assignment reviewer key is invalid or not distinct from provenance",
	);
	const assignmentSignature = decodeCanonicalBase64(
		signatureState.bytes.toString("utf8").trim(),
		64,
		"Detached orchestrator assignment signature",
	);
	assert(
		verifyBytes(null, assignmentState.bytes, trustRootKey, assignmentSignature),
		"Detached orchestrator assignment signature is invalid",
	);
	return {
		assignment,
		assignmentSha512: assignmentState.sha512,
		assignmentSignatureSha512: signatureState.sha512,
		trustRootKeyId,
		trustRootSha512: trustRootState.sha512,
		trustRootRepresentation: parsedTrustRoot.representation,
		reviewerKeyId,
		reviewerPublicKey,
	};
};

export const verifyIndependentReviewReceipt = (
	plan,
	head,
	receiptPath = process.env.RPGJS_SOLO_REVIEW_RECEIPT_PATH,
	verifiedAssignment = verifyExternalOrchestratorAssignment(plan),
) => {
	const config = plan.reviewEvidence.independentReceipt;
	const assignment = verifiedAssignment.assignment;
	assert(
		config.status === "final",
		"A producer-disjoint signed review receipt is required",
	);
	assert(
		receiptPath && isAbsolute(receiptPath),
		"RPGJS_SOLO_REVIEW_RECEIPT_PATH must name the signed review statement",
	);
	const signaturePath = `${receiptPath}.sig`;
	const receiptState = regularFileState(
		receiptPath,
		"Independent review receipt",
		{ owner: currentUid(), mode: 0o600 },
	);
	const signatureState = regularFileState(
		signaturePath,
		"Independent review receipt signature",
		{ owner: currentUid(), mode: 0o600 },
	);
	assert(
		receiptState && signatureState,
		"Independent review receipt or signature is missing",
	);
	const receiptBytes = receiptState.bytes;
	const receipt = JSON.parse(receiptBytes);
	assert(
		receipt.schemaVersion === 1 &&
			receipt.algorithm === "ed25519" &&
			receipt.keyId === assignment.reviewerKeyId &&
			receipt.verdict === "ACCEPT" &&
			receipt.releaseId === plan.releaseId &&
			receipt.version === plan.version &&
			receipt.enginePullRequest ===
				plan.reviewEvidence.enginePullRequest.number &&
			receipt.engineMergeCommit === plan.requiredSourceCommit &&
			receipt.releasePullRequest ===
				plan.reviewEvidence.releasePullRequest.number &&
			receipt.releaseMergeCommit === head &&
			receipt.planSha512 === plan.planSha512 &&
			receipt.producerTaskId === assignment.producerTaskId &&
			receipt.producerPrincipalId === assignment.producerPrincipalId &&
			receipt.reviewerTaskId === assignment.reviewerTaskId &&
			receipt.reviewerPrincipalId === assignment.reviewerPrincipalId &&
			receipt.reviewerRole === assignment.reviewerRole &&
			receipt.reviewerForkId === assignment.reviewerForkId &&
			receipt.assignmentSha512 === verifiedAssignment.assignmentSha512 &&
			receipt.trustRootKeyId === verifiedAssignment.trustRootKeyId &&
			receipt.producerTaskId !== receipt.reviewerTaskId &&
			receipt.producerPrincipalId !== receipt.reviewerPrincipalId,
		"Independent review receipt does not bind the exact producer-disjoint release",
	);
	const signature = decodeCanonicalBase64(
		signatureState.bytes.toString("utf8").trim(),
		64,
		"Independent review receipt signature",
	);
	assert(
		verifyBytes(
			null,
			receiptBytes,
			verifiedAssignment.reviewerPublicKey,
			signature,
		),
		"Independent review receipt signature is invalid",
	);
	return {
		sha512: receiptState.sha512,
		signatureSha512: signatureState.sha512,
		assignmentSha512: receipt.assignmentSha512,
		trustRootKeyId: receipt.trustRootKeyId,
		producerTaskId: receipt.producerTaskId,
		producerPrincipalId: receipt.producerPrincipalId,
		reviewerTaskId: receipt.reviewerTaskId,
		reviewerPrincipalId: receipt.reviewerPrincipalId,
		reviewerRole: receipt.reviewerRole,
		reviewerForkId: receipt.reviewerForkId,
	};
};

export const assertReviewedCanonicalMain = (
	plan,
	head,
	command = run,
	root = rootDirectory,
) => {
	assert(
		plan.reviewEvidence.status === "final",
		"Canonical publication requires final reviewed-merge evidence",
	);
	const orchestratorAssignment = verifyExternalOrchestratorAssignment(plan, {
		repositoryRoot: root,
	});
	const engine = assertPullRequestReviewEvidence({
		record: plan.reviewEvidence.enginePullRequest,
		expectedMergeCommit: plan.requiredSourceCommit,
		command,
	});
	const release = assertPullRequestReviewEvidence({
		record: plan.reviewEvidence.releasePullRequest,
		expectedMergeCommit: head,
		command,
	});
	for (const evidence of [engine, release]) {
		const parents = command(
			"git",
			["show", "-s", "--format=%P", evidence.mergeCommit],
			{ cwd: root },
		).split(/\s+/);
		assert(
			parents.length === 2 &&
				parents[0] === evidence.baseCommit &&
				parents[1] === evidence.headCommit,
			`Pull request #${evidence.number} merge parents do not bind its exact base and head`,
		);
	}
	const independentReceipt =
		engine.githubApproved && release.githubApproved
			? null
			: verifyIndependentReviewReceipt(
					plan,
					head,
					process.env.RPGJS_SOLO_REVIEW_RECEIPT_PATH,
					orchestratorAssignment,
				);
	return {
		engine,
		release,
		orchestratorAssignment: {
			assignmentSha512: orchestratorAssignment.assignmentSha512,
			trustRootKeyId: orchestratorAssignment.trustRootKeyId,
			reviewerKeyId: orchestratorAssignment.reviewerKeyId,
			producerTaskId: orchestratorAssignment.assignment.producerTaskId,
			producerPrincipalId:
				orchestratorAssignment.assignment.producerPrincipalId,
			reviewerTaskId: orchestratorAssignment.assignment.reviewerTaskId,
			reviewerPrincipalId:
				orchestratorAssignment.assignment.reviewerPrincipalId,
			reviewerRole: orchestratorAssignment.assignment.reviewerRole,
			reviewerForkId: orchestratorAssignment.assignment.reviewerForkId,
		},
		independentReceipt,
	};
};

const changedWorktreePaths = (root, command = run) => {
	const tracked = command("git", ["diff", "--name-only", "HEAD"], {
		cwd: root,
	});
	const untracked = command(
		"git",
		["ls-files", "--others", "--exclude-standard"],
		{ cwd: root },
	);
	return [...new Set(`${tracked}\n${untracked}`.split("\n").filter(Boolean))];
};

const expectedAppliedManifest = (source, path, plan) => {
	const manifest = JSON.parse(source);
	const cohort = new Set(plan.packages.map(({ name }) => name));
	let changed = false;
	if (cohort.has(manifest.name)) {
		assert(
			manifest.version === plan.previousVersion,
			`${path} HEAD version does not match the release source`,
		);
		manifest.version = plan.version;
		changed = true;
	}
	for (const field of dependencyFields) {
		for (const [name, version] of Object.entries(manifest[field] ?? {})) {
			if (!cohort.has(name)) continue;
			assert(
				version === `workspace:${plan.previousVersion}`,
				`${path} HEAD dependency does not match the release source`,
			);
			manifest[field][name] = `workspace:${plan.version}`;
			changed = true;
		}
	}
	assert(changed, `${path} is not a deterministic release manifest output`);
	return `${JSON.stringify(manifest, null, 2)}\n`;
};

const readHeadEntry = (root, path, command = run) => {
	const treeEntry = command("git", ["ls-tree", "HEAD", "--", path], {
		cwd: root,
	});
	const match = /^(100644|100755) blob [0-9a-f]{40}\t/.exec(treeEntry);
	assert(match, `${path} HEAD entry must be a regular Git blob`);
	return {
		source: command("git", ["show", `HEAD:${path}`], {
			cwd: root,
			trim: false,
		}),
		mode: Number.parseInt(match[1].slice(-3), 8),
	};
};

const createApplyContentTransitions = (root, plan, command = run) => {
	const cohort = new Set(plan.packages.map(({ name }) => name));
	const descriptors = [];
	for (const absolutePath of walkPackageJson(root)) {
		const path = relative(root, absolutePath);
		const { source, mode } = readHeadEntry(root, path, command);
		const manifest = JSON.parse(source);
		const dependencyNames = dependencyFields.flatMap((field) =>
			Object.keys(manifest[field] ?? {}),
		);
		if (
			!cohort.has(manifest.name) &&
			!dependencyNames.some((name) => cohort.has(name))
		)
			continue;
		descriptors.push({
			path,
			kind: "manifest",
			source,
			sourceMode: mode,
			target: expectedAppliedManifest(source, path, plan),
			targetMode: mode,
		});
	}
	const changesets = plan.consumedChangesets.map((entry) => {
		const path = `.changeset/${entry.id}.md`;
		const { source } = readHeadEntry(root, path, command);
		assert(
			digest("sha256", source) === entry.sha256,
			`${entry.id} HEAD bytes differ from the release plan`,
		);
		return [entry.id, parseChangeset(source, entry.id)];
	});
	for (const record of plan.packages) {
		const path = `${record.directory}/CHANGELOG.md`;
		let headEntry = "";
		try {
			headEntry = command(
				"git",
				["ls-tree", "--name-only", "HEAD", "--", path],
				{
					cwd: root,
				},
			);
		} catch {
			headEntry = "";
		}
		const existing = headEntry ? readHeadEntry(root, path, command) : null;
		descriptors.push({
			path,
			kind: "changelog",
			source: existing?.source ?? null,
			sourceMode: existing?.mode ?? null,
			target: changelogEntry(record, plan, changesets, existing?.source ?? null),
			targetMode: existing?.mode ?? 0o644,
		});
	}
	for (const entry of plan.consumedChangesets) {
		const path = `.changeset/${entry.id}.md`;
		const { source, mode } = readHeadEntry(root, path, command);
		descriptors.push({
			path,
			kind: "changeset-delete",
			source,
			sourceMode: mode,
			target: null,
			targetMode: null,
		});
	}
	return descriptors;
};

const computeTargetLockfile = (root, manifestTransitions, command = run) => {
	const directory = mkdtempSync(join(tmpdir(), "rpgjs-solo-lock-stage-"));
	const archive = join(directory, "source.tar");
	try {
		command("git", ["archive", "--format=tar", "--output", archive, "HEAD"], {
			cwd: root,
			timeout: 600_000,
		});
		command("tar", ["-xf", archive, "-C", directory], {
			cwd: root,
			timeout: 600_000,
		});
		for (const descriptor of manifestTransitions)
			rewriteOwnedFile(
				join(directory, descriptor.path),
				descriptor.target,
				descriptor.targetMode,
				`Lockfile-stage input ${descriptor.path}`,
			);
		command("pnpm", ["install", "--lockfile-only", "--ignore-scripts"], {
			cwd: directory,
			timeout: 600_000,
		});
		return readFileSync(join(directory, "pnpm-lock.yaml"), "utf8");
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
};

const applyDescriptorRecord = ({
	path,
	kind,
	source,
	sourceMode,
	target,
	targetMode,
}) => ({
	path,
	kind,
	source:
		source === null
			? { exists: false }
			: {
					exists: true,
					type: "file",
					mode: sourceMode,
					sha256: digest("sha256", source),
				},
	target:
		target === null
			? { exists: false }
			: {
					exists: true,
					type: "file",
					mode: targetMode,
					sha256: digest("sha256", target),
				},
});

const createApplyTransaction = (root, plan, command, targetLockfileFactory) => {
	const head = command("git", ["rev-parse", "HEAD"], { cwd: root });
	assertReleaseCommitAncestry(root, plan, head, command);
	const content = createApplyContentTransitions(root, plan, command);
	const targetLockfile = targetLockfileFactory(
		root,
		content.filter(({ kind }) => kind === "manifest"),
		command,
	);
	const lockfileSource = readHeadEntry(root, "pnpm-lock.yaml", command);
	const lockfile = {
		path: "pnpm-lock.yaml",
		kind: "lockfile",
		source: lockfileSource.source,
		sourceMode: lockfileSource.mode,
		target: targetLockfile,
		targetMode: lockfileSource.mode,
	};
	const descriptors = [...content, lockfile];
	return {
		head,
		descriptors,
		journal: {
			schemaVersion: 1,
			releaseId: plan.releaseId,
			sourceHead: head,
			planSha512: plan.planSha512,
			outputs: descriptors.map(applyDescriptorRecord),
		},
	};
};

const fileMatchesRecord = (root, path, record) => {
	const absolutePath = join(root, path);
	if (!record.exists) return lstatOrNull(absolutePath) === null;
	let state;
	try {
		state = regularFileState(absolutePath, `${path} apply output`);
	} catch {
		return false;
	}
	return (
		state !== null &&
		record.type === "file" &&
		state.mode === record.mode &&
		state.sha256 === record.sha256
	);
};

const applyJournalPurpose = (plan) => `solo-apply:${plan.releaseId}:journal`;
const applyOutputPurpose = (plan, descriptor) =>
	`solo-apply:${plan.releaseId}:${descriptor.path}`;

const assertApplyTransactionState = (
	root,
	plan,
	transaction,
	journalPath,
	command,
) => {
	assert(
		JSON.stringify(
			readTransactionJournal(journalPath, applyJournalPurpose(plan)),
		) === JSON.stringify(transaction.journal),
		"Apply journal differs from the exact planned transaction",
	);
	const allowed = new Set([
		relative(root, journalPath),
		...transaction.descriptors.map(({ path }) => path),
	]);
	const unexpected = changedWorktreePaths(root, command).filter(
		(path) => !allowed.has(path),
	);
	assert(
		unexpected.length === 0,
		`Apply transaction contains unrelated changes: ${unexpected.join(", ")}`,
	);
	for (const [index, descriptor] of transaction.descriptors.entries()) {
		const record = transaction.journal.outputs[index];
		assert(
			fileMatchesRecord(root, descriptor.path, record.source) ||
				fileMatchesRecord(root, descriptor.path, record.target),
			`${descriptor.path} contains bytes outside the exact source/target transaction`,
		);
	}
};

const applyTransactionDescriptor = (root, plan, descriptor, beforeRename) => {
	const path = join(root, descriptor.path);
	if (descriptor.target === null) rmSync(path);
	else
		secureAtomicWriteFile(path, descriptor.target, {
			mode: descriptor.targetMode,
			purpose: applyOutputPurpose(plan, descriptor),
			beforeRename: (details) =>
				beforeRename({
					kind: descriptor.kind,
					path: descriptor.path,
					...details,
				}),
		});
};

export const applySoloReleaseTransaction = (
	root,
	plan,
	command = run,
	{
		afterBoundary = () => {},
		beforeRename = () => {},
		targetLockfileFactory = computeTargetLockfile,
	} = {},
) => {
	const journalPath = join(root, applyJournalName);
	const journalInitiallyExists = lstatOrNull(journalPath) !== null;
	if (!journalInitiallyExists) {
		const before = validateSoloReleaseState(root, plan);
		if (before.phase === "applied")
			return {
				changed: false,
				phase: "applied",
				lockfileRefreshed: false,
				appliedBoundaries: 0,
			};
		assert(
			before.phase === "source",
			"A new apply transaction requires source state",
		);
	}
	const transaction = createApplyTransaction(
		root,
		plan,
		command,
		targetLockfileFactory,
	);
	const journalBytes = `${JSON.stringify(transaction.journal, null, 2)}\n`;
	recoverTransactionTemps(
		journalPath,
		journalBytes,
		0o600,
		applyJournalPurpose(plan),
	);
	const journalRecovered = lstatOrNull(journalPath) !== null;
	if (!journalInitiallyExists && !journalRecovered)
		assert(
			command("git", ["status", "--porcelain"], { cwd: root }) === "",
			"The version transition requires a clean worktree",
		);
	if (!journalRecovered)
		secureAtomicWriteFile(journalPath, journalBytes, {
			mode: 0o600,
			purpose: applyJournalPurpose(plan),
			beforeRename: (details) =>
				beforeRename({ kind: "journal", path: applyJournalName, ...details }),
		});
	for (const descriptor of transaction.descriptors)
		if (descriptor.target !== null)
			recoverTransactionTemps(
				join(root, descriptor.path),
				descriptor.target,
				descriptor.targetMode,
				applyOutputPurpose(plan, descriptor),
			);
	assertApplyTransactionState(root, plan, transaction, journalPath, command);
	let appliedBoundaries = 0;
	for (const [index, descriptor] of transaction.descriptors.entries()) {
		const output = transaction.journal.outputs[index];
		const target = output.target;
		if (!fileMatchesRecord(root, descriptor.path, target)) {
			assert(
				fileMatchesRecord(root, descriptor.path, output.source),
				`${descriptor.path} changed immediately before its transaction boundary`,
			);
			applyTransactionDescriptor(root, plan, descriptor, beforeRename);
			appliedBoundaries += 1;
			afterBoundary({
				index,
				kind: descriptor.kind,
				path: descriptor.path,
			});
		}
	}
	const after = validateSoloReleaseState(root, plan);
	assert(after.phase === "applied", "Solo release application did not persist");
	rmSync(journalPath);
	return {
		changed: appliedBoundaries > 0,
		phase: "applied",
		lockfileRefreshed: true,
		appliedBoundaries,
	};
};

export const assertCanonicalMain = (root, plan, command = run) => {
	const status = command("git", ["status", "--porcelain"], { cwd: root });
	assert(status === "", "Release phases require a clean worktree");
	const branch = command("git", ["branch", "--show-current"], { cwd: root });
	assert(
		branch === plan.canonical.branch,
		`Release phases require branch ${plan.canonical.branch}`,
	);
	const head = command("git", ["rev-parse", "HEAD"], { cwd: root });
	const githubHead = command(
		"git",
		[
			"ls-remote",
			plan.canonical.repository,
			`refs/heads/${plan.canonical.branch}`,
		],
		{ cwd: root },
	).split(/\s/)[0];
	const giteaHead = command(
		"git",
		[
			"ls-remote",
			plan.backup.repository,
			`refs/heads/${plan.canonical.branch}`,
		],
		{ cwd: root },
	).split(/\s/)[0];
	assert(head === githubHead, "Local HEAD is not exact canonical GitHub main");
	assert(
		head === giteaHead,
		"Gitea backup main is not exact canonical GitHub main",
	);
	assertReleaseCommitAncestry(root, plan, head, command);
	const reviewEvidence = assertReviewedCanonicalMain(plan, head, command, root);
	const tree = command("git", ["rev-parse", "HEAD^{tree}"], { cwd: root });
	return { head, tree, reviewEvidence };
};

const prepareArtifactDirectory = (root, path) => {
	assert(
		path && isAbsolute(path),
		"--artifacts must be an absolute directory outside the repository",
	);
	const rootReal = realpathSync(root);
	const parent = realpathSync(dirname(path));
	const resolved = join(parent, basename(path));
	assert(
		resolved !== rootReal && !resolved.startsWith(`${rootReal}${sep}`),
		"Release artifacts must remain outside the repository",
	);
	assert(
		lstatOrNull(resolved) === null,
		"Release artifacts directory must be new and empty",
	);
	mkdirSync(resolved, { recursive: false, mode: 0o700 });
	const created = lstatSync(resolved);
	assert(
		created.isDirectory() &&
			!created.isSymbolicLink() &&
			created.uid === currentUid() &&
			permissionMode(created) === 0o700 &&
			readdirSync(resolved).length === 0,
		"Release artifacts directory was not created securely",
	);
	return resolved;
};

const collectExportTargets = (value, targets = []) => {
	if (typeof value === "string") targets.push(value);
	else if (Array.isArray(value))
		for (const item of value) collectExportTargets(item, targets);
	else if (value && typeof value === "object")
		for (const item of Object.values(value))
			collectExportTargets(item, targets);
	return targets;
};

const assertPackedExports = (packedDirectory, manifest, packageName) => {
	const targets = [
		...collectExportTargets(manifest.exports),
		...collectExportTargets(manifest.main),
		...collectExportTargets(manifest.module),
		...collectExportTargets(manifest.types),
		...collectExportTargets(manifest.typings),
		...collectExportTargets(manifest.browser),
		...collectExportTargets(manifest.bin),
	];
	assert(targets.length > 0, `${packageName} archive has no public entrypoint`);
	for (const target of new Set(targets)) {
		assert(
			target.startsWith("./") && !target.includes("*"),
			`${packageName} has an unprovable export target ${target}`,
		);
		const path = resolve(packedDirectory, target);
		assert(
			path.startsWith(`${packedDirectory}${sep}`) &&
				existsSync(path) &&
				statSync(path).isFile(),
			`${packageName} archive is missing export target ${target}`,
		);
	}
};

export const assertExactSourceWorktree = (root, source, command = run) => {
	const head = command("git", ["rev-parse", "HEAD"], { cwd: root });
	const tree = command("git", ["rev-parse", "HEAD^{tree}"], { cwd: root });
	const status = command(
		"git",
		["status", "--porcelain=v1", "--untracked-files=all"],
		{ cwd: root },
	);
	const generatedDistPrefixes = [
		"packages/solo/dist/",
		"packages/solo-action-battle/dist/",
		"packages/solo-renderer/dist/",
		"packages/solo-vite/dist/",
	];
	const foreignStatus = status
		.split("\n")
		.filter(Boolean)
		.filter(
			(line) =>
				!generatedDistPrefixes.some(
					(prefix) =>
						line.startsWith("?? ") && line.slice(3).startsWith(prefix),
				),
		);
	assert(
		head === source.head && tree === source.tree && foreignStatus.length === 0,
		"Reviewed source worktree changed during provenance packing",
	);
	return { head, tree };
};

const cleanBuildSoloCohort = (
	root,
	plan,
	source,
	command = run,
	sourceCommand = run,
) => {
	for (const record of plan.packages)
		rmSync(join(root, record.directory, "dist"), {
			recursive: true,
			force: true,
		});
	assertExactSourceWorktree(root, source, sourceCommand);
	for (const record of plan.packages) {
		command("pnpm", ["--filter", record.name, "run", "build"], {
			cwd: root,
			stdio: "inherit",
			timeout: 600_000,
		});
		assert(
			existsSync(join(root, record.directory, "dist")),
			`${record.name} clean build did not create dist`,
		);
		assertExactSourceWorktree(root, source, sourceCommand);
	}
};

const assertFinalAttestationConfiguration = (plan) => {
	assert(
		plan.provenanceAttestation.status === "final",
		"Pack requires a final trusted provenance attestation key",
	);
};

const defaultProvenanceSigner = (plan) => {
	assertFinalAttestationConfiguration(plan);
	const keyPath = process.env.RPGJS_SOLO_PROVENANCE_SIGNING_KEY_FILE;
	assert(
		keyPath && isAbsolute(keyPath) && existsSync(keyPath),
		"RPGJS_SOLO_PROVENANCE_SIGNING_KEY_FILE must name the trusted private key",
	);
	const keyState = regularFileState(keyPath, "Provenance signing key", {
		owner: currentUid(),
		mode: 0o600,
	});
	assert(keyState, "Provenance signing key is missing");
	const privateKey = createPrivateKey(keyState.bytes);
	const publicKey = createPublicKey(privateKey);
	const keyId = digest(
		"sha256",
		publicKey.export({ type: "spki", format: "der" }),
	);
	assert(
		keyId === plan.provenanceAttestation.keyId,
		"Provenance private key does not match the reviewed public key",
	);
	return (value) => signBytes(null, value, privateKey);
};

const attestationPaths = (manifestPath) => ({
	statement: `${manifestPath}.attestation.json`,
	signature: `${manifestPath}.attestation.sig`,
});

const writeProvenanceAttestation = (
	manifestPath,
	manifest,
	plan,
	signer = defaultProvenanceSigner(plan),
) => {
	assertFinalAttestationConfiguration(plan);
	const paths = attestationPaths(manifestPath);
	const manifestState = regularFileState(
		manifestPath,
		"Provenance manifest before attestation",
	);
	assert(manifestState, "Provenance manifest is missing before attestation");
	const statement = {
		schemaVersion: 1,
		algorithm: "ed25519",
		keyId: plan.provenanceAttestation.keyId,
		subject: {
			releaseId: manifest.releaseId,
			version: manifest.version,
			manifestSha512: manifestState.sha512,
			sourceCommit: manifest.source.commit,
			sourceTree: manifest.source.tree,
			planSha512: manifest.plan.sha512,
		},
	};
	const statementBytes = Buffer.from(`${JSON.stringify(statement, null, 2)}\n`);
	writeExclusiveFile(paths.statement, statementBytes, 0o644);
	const signature = signer(statementBytes);
	writeExclusiveFile(
		paths.signature,
		`${Buffer.from(signature).toString("base64")}\n`,
		0o644,
	);
	return paths;
};

const verifyProvenanceEnvelope = (manifestPath, plan) => {
	assertFinalAttestationConfiguration(plan);
	const paths = attestationPaths(manifestPath);
	const manifestState = regularFileState(manifestPath, "Provenance manifest");
	const statementState = regularFileState(
		paths.statement,
		"Provenance attestation statement",
	);
	const signatureState = regularFileState(
		paths.signature,
		"Provenance attestation signature",
	);
	assert(
		manifestState && statementState && signatureState,
		"Signed provenance attestation is missing",
	);
	const manifestBytes = manifestState.bytes;
	const statementBytes = statementState.bytes;
	const statement = JSON.parse(statementBytes);
	assert(
		statement.schemaVersion === 1 &&
			statement.algorithm === "ed25519" &&
			statement.keyId === plan.provenanceAttestation.keyId &&
			statement.subject?.releaseId === plan.releaseId &&
			statement.subject?.version === plan.version &&
			statement.subject?.manifestSha512 === digest("sha512", manifestBytes) &&
			statement.subject?.planSha512 === plan.planSha512,
		"Provenance attestation statement drifted",
	);
	const signature = decodeCanonicalBase64(
		signatureState.bytes.toString("utf8").trim(),
		64,
		"Provenance attestation signature",
	);
	assert(
		verifyBytes(
			null,
			statementBytes,
			createPublicKey(plan.provenanceAttestation.publicKeyPem),
			signature,
		),
		"Provenance attestation signature is invalid",
	);
	return {
		...paths,
		manifestBytes,
		manifestSha512: manifestState.sha512,
		statement,
	};
};

export const createProvenanceManifest = ({
	root,
	plan,
	artifactsDirectory,
	source,
	command = run,
	sourceCommand = run,
	signer,
}) => {
	assert(
		validateSoloReleaseState(root, plan).phase === "applied",
		"Provenance requires the applied version phase",
	);
	const artifactRoot = prepareArtifactDirectory(root, artifactsDirectory);
	assertExactSourceWorktree(root, source, sourceCommand);
	cleanBuildSoloCohort(root, plan, source, command, sourceCommand);
	let reviewReceipt;
	if (source.reviewEvidence?.independentReceipt) {
		const sourceStatement = process.env.RPGJS_SOLO_REVIEW_RECEIPT_PATH;
		const sourceSignature = `${sourceStatement}.sig`;
		const sourceStatementState = sourceStatement
			? regularFileState(sourceStatement, "Independent review receipt source", {
					owner: currentUid(),
					mode: 0o600,
				})
			: null;
		const sourceSignatureState = sourceStatement
			? regularFileState(
					sourceSignature,
					"Independent review receipt signature source",
					{ owner: currentUid(), mode: 0o600 },
				)
			: null;
		assert(
			sourceStatementState?.sha512 ===
				source.reviewEvidence.independentReceipt.sha512 &&
				sourceSignatureState?.sha512 ===
					source.reviewEvidence.independentReceipt.signatureSha512,
			"Independent review receipt bytes changed before provenance packing",
		);
		const statementName = `${plan.releaseId}.review-receipt.json`;
		const signatureName = `${statementName}.sig`;
		const statementPath = join(artifactRoot, statementName);
		const signaturePath = join(artifactRoot, signatureName);
		writeExclusiveFile(statementPath, sourceStatementState.bytes, 0o600);
		writeExclusiveFile(signaturePath, sourceSignatureState.bytes, 0o600);
		reviewReceipt = {
			statement: statementName,
			signature: signatureName,
			sha512: sha512File(statementPath),
			signatureSha512: sha512File(signaturePath),
		};
	}
	const packages = [];
	for (const record of plan.packages) {
		assertExactSourceWorktree(root, source, sourceCommand);
		const packageArtifacts = join(
			artifactRoot,
			record.name.replaceAll("/", "-"),
		);
		mkdirSync(packageArtifacts, { mode: 0o700 });
		const { archivePath } = packPackageArchive({
			packageDirectory: join(root, record.directory),
			destinationDirectory: packageArtifacts,
		});
		assertExactSourceWorktree(root, source, sourceCommand);
		const inspectionDirectory = join(packageArtifacts, "inspection");
		const { packedDirectory, packedManifest } = inspectPortablePackageArchive({
			archivePath,
			extractDirectory: inspectionDirectory,
			packageName: record.name,
		});
		assert(
			packedManifest.name === record.name &&
				packedManifest.version === plan.version,
			`${record.name} archive identity drifted`,
		);
		assertPackedExports(packedDirectory, packedManifest, record.name);
		const cohort = new Set(plan.packages.map(({ name }) => name));
		for (const field of dependencyFields) {
			for (const [name, dependencyVersion] of Object.entries(
				packedManifest[field] ?? {},
			)) {
				if (cohort.has(name)) {
					assert(
						dependencyVersion === plan.version,
						`${record.name} archive has non-exact cohort ${field} ${name}@${dependencyVersion}`,
					);
				}
			}
		}
		rmSync(inspectionDirectory, { recursive: true, force: true });
		packages.push({
			name: record.name,
			version: plan.version,
			tag: record.tag,
			archive: relative(artifactRoot, archivePath),
			sha512: sha512File(archivePath),
			integrity: sri512File(archivePath),
			repository: packedManifest.repository,
			engines: packedManifest.engines,
			...Object.fromEntries(
				dependencyFields.map((field) => [field, packedManifest[field] ?? {}]),
			),
			exports: packedManifest.exports,
			publishManifest: packedManifest,
		});
	}
	const changesetRecord = (entry) => ({ ...entry });
	const manifest = {
		schemaVersion: 3,
		releaseId: plan.releaseId,
		version: plan.version,
		source: {
			repository: plan.canonical.repository,
			branch: plan.canonical.branch,
			commit: source.head,
			tree: source.tree,
			requiredSourceCommit: plan.requiredSourceCommit,
			upstreamCommit: plan.upstreamCommit,
			reviewEvidence: source.reviewEvidence,
		},
		lockfile: {
			path: "pnpm-lock.yaml",
			sha512: sha512File(join(root, "pnpm-lock.yaml")),
		},
		plan: {
			path: relative(root, plan.planPath),
			sha512: plan.planSha512,
		},
		registry: plan.registry,
		candidateDistTag: plan.candidateDistTag,
		promotionDistTag: plan.promotionDistTag,
		trainTag: plan.trainTag,
		packages,
		consumedChangesets: plan.consumedChangesets.map(changesetRecord),
		carriedChangesets: plan.carriedChangesets.map(changesetRecord),
		requiredConsumer: plan.requiredConsumer,
		reviewReceipt,
	};
	const manifestPath = join(artifactRoot, `${plan.releaseId}.provenance.json`);
	writeJson(manifestPath, manifest);
	const sidecarPath = `${manifestPath}.sha512`;
	writeExclusiveFile(
		sidecarPath,
		`${sha512File(manifestPath)}  ${manifestPath.split(sep).at(-1)}\n`,
		0o644,
	);
	const signed = writeProvenanceAttestation(
		manifestPath,
		manifest,
		plan,
		signer,
	);
	return { manifestPath, sidecarPath, ...signed, manifest };
};

export const withEphemeralNpmAuth = async (token, registry, callback) => {
	assert(token, "RPGJS_SOLO_NPM_TOKEN is required");
	const directory = mkdtempSync(join(tmpdir(), "rpgjs-solo-npm-auth-"));
	const npmrc = join(directory, ".npmrc");
	const registryPath = new URL(registry).host + new URL(registry).pathname;
	const arcadeRegistry =
		"https://git.local.jonbogaty.com/api/packages/arcade-cabinet/npm/";
	const arcadePath =
		new URL(arcadeRegistry).host + new URL(arcadeRegistry).pathname;
	writeExclusiveFile(
		npmrc,
		`registry=https://registry.npmjs.org/\n@jbcom:registry=${registry}\n@arcade-cabinet:registry=${arcadeRegistry}\n//${registryPath}:_authToken=${token}\n//${arcadePath}:_authToken=${token}\nalways-auth=true\n`,
		0o600,
	);
	try {
		const childEnvironment = {
			...process.env,
			npm_config_userconfig: npmrc,
		};
		delete childEnvironment.RPGJS_SOLO_NPM_TOKEN;
		return await callback(childEnvironment, token);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
};

export const loadProvenance = (
	manifestPath,
	plan,
	root = rootDirectory,
	{
		inspectArchive = inspectPortablePackageArchive,
		onArtifactAccess = () => {},
	} = {},
) => {
	assert(isAbsolute(manifestPath), "--manifest must be an absolute path");
	const envelope = verifyProvenanceEnvelope(manifestPath, plan);
	const manifest = JSON.parse(envelope.manifestBytes);
	assert(
		envelope.statement.subject.sourceCommit === manifest.source?.commit &&
			envelope.statement.subject.sourceTree === manifest.source?.tree &&
			envelope.statement.subject.planSha512 === manifest.plan?.sha512,
		"Provenance attestation source binding drifted",
	);
	assert(
		manifest.schemaVersion === 3 &&
			manifest.releaseId === plan.releaseId &&
			manifest.version === plan.version,
		"Provenance identity drifted",
	);
	assert(
		manifest.source.upstreamCommit === plan.upstreamCommit,
		"Provenance upstream commit drifted",
	);
	assert(
		manifest.source.repository === plan.canonical.repository &&
			manifest.source.branch === plan.canonical.branch &&
			manifest.source.requiredSourceCommit === plan.requiredSourceCommit,
		"Provenance canonical source contract drifted",
	);
	assert(
		manifest.registry === plan.registry &&
			manifest.candidateDistTag === plan.candidateDistTag &&
			manifest.promotionDistTag === plan.promotionDistTag &&
			manifest.trainTag === plan.trainTag,
		"Provenance registry or tag contract drifted",
	);
	assert(
		manifest.plan.sha512 === plan.planSha512,
		"Provenance plan hash drifted",
	);
	assert(
		JSON.stringify(manifest.consumedChangesets) ===
			JSON.stringify(plan.consumedChangesets) &&
			JSON.stringify(manifest.carriedChangesets) ===
				JSON.stringify(plan.carriedChangesets),
		"Provenance changeset contract drifted",
	);
	assert(
		manifest.lockfile.path === "pnpm-lock.yaml",
		"Provenance lockfile path drifted",
	);
	assert(
		manifest.lockfile.sha512 === sha512File(join(root, manifest.lockfile.path)),
		"Provenance lockfile hash drifted",
	);
	assert(
		manifest.packages.length === plan.packages.length &&
			manifest.packages.every(
				(item, index) =>
					item.name === plan.packages[index].name &&
					item.version === plan.version &&
					item.tag === plan.packages[index].tag,
			),
		"Provenance package cohort drifted",
	);
	if (manifest.source.reviewEvidence?.independentReceipt) {
		onArtifactAccess({ kind: "review-receipt" });
		assert(manifest.reviewReceipt, "Signed review receipt evidence is missing");
		assert(
			manifest.reviewReceipt.signature ===
				`${manifest.reviewReceipt.statement}.sig`,
			"Signed review receipt signature path is not paired with its statement",
		);
		const artifactRoot = realpathSync(dirname(manifestPath));
		let receiptPath;
		for (const [field, hashField] of [
			["statement", "sha512"],
			["signature", "signatureSha512"],
		]) {
			const path = resolve(
				dirname(manifestPath),
				manifest.reviewReceipt[field],
			);
			const realPath = existsSync(path) ? realpathSync(path) : path;
			const artifactState = existsSync(realPath)
				? regularFileState(realPath, `Signed review receipt ${field}`)
				: null;
			assert(
				path.startsWith(`${dirname(manifestPath)}${sep}`) &&
					realPath.startsWith(`${artifactRoot}${sep}`) &&
					artifactState?.sha512 === manifest.reviewReceipt[hashField],
				"Signed review receipt artifact drifted",
			);
			if (field === "statement") receiptPath = realPath;
		}
		const verifiedReceipt = verifyIndependentReviewReceipt(
			plan,
			manifest.source.commit,
			receiptPath,
		);
		assert(
			verifiedReceipt.sha512 === manifest.reviewReceipt.sha512 &&
				verifiedReceipt.signatureSha512 ===
					manifest.reviewReceipt.signatureSha512 &&
				JSON.stringify(verifiedReceipt) ===
					JSON.stringify(manifest.source.reviewEvidence.independentReceipt),
			"Signed review receipt differs from canonical review evidence",
		);
	} else {
		assert(
			manifest.reviewReceipt === undefined,
			"Provenance has an unexpected independent review receipt",
		);
	}
	for (const item of manifest.packages) {
		onArtifactAccess({ kind: "archive", name: item.name });
		const archivePath = resolve(dirname(manifestPath), item.archive);
		const artifactRoot = realpathSync(dirname(manifestPath));
		const archiveRealPath = realpathSync(archivePath);
		const archiveState = regularFileState(
			archiveRealPath,
			`${item.name} provenance archive`,
		);
		assert(
			archiveRealPath.startsWith(`${artifactRoot}${sep}`),
			"Archive escaped provenance directory",
		);
		assert(
			archiveState?.sha512 === item.sha512 &&
				snapshotIntegrity(archiveState.bytes) === item.integrity,
			`${item.name} archive bytes drifted`,
		);
		const inspectionDirectory = mkdtempSync(
			join(tmpdir(), "rpgjs-solo-provenance-inspection-"),
		);
		try {
			const inspectionArchive = join(inspectionDirectory, "archive.tgz");
			writeExclusiveFile(inspectionArchive, archiveState.bytes, 0o400);
			const { packedDirectory, packedManifest } = inspectArchive({
				archivePath: inspectionArchive,
				extractDirectory: join(inspectionDirectory, "extract"),
				packageName: item.name,
			});
			assert(
				packedManifest.name === item.name &&
					packedManifest.version === plan.version &&
					JSON.stringify(packedManifest.repository) ===
						JSON.stringify(item.repository) &&
					JSON.stringify(packedManifest.engines) ===
						JSON.stringify(item.engines) &&
					dependencyFields.every(
						(field) =>
							JSON.stringify(packedManifest[field] ?? {}) ===
							JSON.stringify(item[field] ?? {}),
					) &&
					JSON.stringify(packedManifest.exports) ===
						JSON.stringify(item.exports) &&
					JSON.stringify(packedManifest) ===
						JSON.stringify(item.publishManifest),
				`${item.name} archive metadata differs from signed provenance`,
			);
			assertPackedExports(packedDirectory, packedManifest, item.name);
		} finally {
			rmSync(inspectionDirectory, { recursive: true, force: true });
		}
	}
	const sidecarPath = `${manifestPath}.sha512`;
	const sidecarState = regularFileState(
		sidecarPath,
		"Provenance SHA-512 sidecar",
	);
	assert(sidecarState, "Provenance SHA-512 sidecar is missing");
	assert(
		sidecarState.bytes.toString("utf8") ===
			`${envelope.manifestSha512}  ${manifestPath.split(sep).at(-1)}\n`,
		"Provenance SHA-512 sidecar drifted",
	);
	return manifest;
};

const registryViewErrorLooksMissing = (error) => {
	const details = `${error?.message ?? ""}\n${error?.stdout ?? ""}\n${error?.stderr ?? ""}`;
	return /\b(?:ERR_PNPM_(?:FETCH_404|PACKAGE_NOT_FOUND|NO_MATCHING_VERSION)|E404)\b/i.test(
		details,
	);
};

export const pnpmView = (spec, field, plan, env, command = run) => {
	try {
		const output = command(
			"pnpm",
			["view", spec, field, "--json", "--registry", plan.registry],
			{ env },
		);
		assert(
			output !== "",
			`Registry returned an empty response for ${spec} ${field}`,
		);
		return JSON.parse(output);
	} catch (error) {
		if (registryViewErrorLooksMissing(error)) return undefined;
		throw new Error(`Registry read failed for ${spec} ${field}`, {
			cause: error,
		});
	}
};

export const assertCandidateCohort = (manifest, plan, env, view = pnpmView) => {
	for (const item of manifest.packages) {
		const tags = view(item.name, "dist-tags", plan, env);
		assert(
			tags?.[plan.candidateDistTag] === plan.version,
			`${item.name} candidate tag is not ${plan.version}`,
		);
		const integrity = view(
			`${item.name}@${plan.version}`,
			"dist.integrity",
			plan,
			env,
		);
		assert(
			integrity === item.integrity,
			`${item.name} registry integrity differs from the provenance manifest`,
		);
	}
};

export const assertLivePromotedCohort = (
	manifest,
	plan,
	env,
	view = pnpmView,
) => {
	assertCandidateCohort(manifest, plan, env, view);
	for (const item of manifest.packages) {
		const tags = view(item.name, "dist-tags", plan, env);
		assert(
			tags?.[plan.promotionDistTag] === plan.version,
			`${item.name} live latest is not ${plan.version}`,
		);
	}
};

export const nextPromotionAction = ({
	currentLatest,
	priorLatest,
	version,
	complete = false,
}) => {
	if (complete) {
		assert(
			currentLatest === version,
			`completed latest promotion changed unexpectedly from ${version} to ${String(currentLatest)}`,
		);
		return "complete";
	}
	if (currentLatest === version) return "complete";
	if (currentLatest === priorLatest) return "promote";
	throw new Error(
		`latest changed unexpectedly from ${String(priorLatest)} to ${String(currentLatest)}`,
	);
};

export const publishedConsumerInstallArgs = Object.freeze([
	"install",
	"--ignore-scripts",
	"--ignore-workspace",
]);

export const createPublishedConsumerContract = (manifest, plan) => {
	const compatibility = fleetPatchCompatibility.get(
		plan.requiredConsumer.version,
	);
	assert(
		compatibility,
		`No consumer toolchain is defined for ${plan.requiredConsumer.package}@${plan.requiredConsumer.version}`,
	);
	return {
	packageJson: {
		name: "rpgjs-solo-release-consumer",
		private: true,
		type: "module",
		dependencies: Object.fromEntries([
			...manifest.packages.map(({ name }) => [name, plan.version]),
			[plan.requiredConsumer.package, plan.requiredConsumer.version],
			["@types/react", "19.2.17"],
			["canvasengine", compatibility.canvasengine],
			["pixi.js", "8.19.0"],
			["react", "19.2.8"],
			["typescript", "7.0.2"],
			["vite", compatibility.vite],
		]),
	},
	runtimeCheck: `import { SoloRuntime } from '@jbcom/rpgjs-solo'
import { SoloActionBattle } from '@jbcom/rpgjs-solo-action-battle'
import { inspectSoloBundle } from '@jbcom/rpgjs-solo-vite'

const runtime = new SoloRuntime({ fixedStepMs: 16 })
runtime.registerMap({ id: 'release', width: 32, height: 32, entities: [{ id: 'hero', kind: 'player', x: 1, y: 1 }] })
runtime.setActiveMap('release')
if (!new SoloActionBattle(runtime).canMove('hero').available) throw new Error('action battle failed')
if (inspectSoloBundle({}).length !== 0) throw new Error('vite boundary failed')
`,
	indexHtml:
		'<!doctype html><html><body><main id="app"></main><script type="module" src="/src/main.ts"></script></body></html>\n',
	tsconfig: {
		compilerOptions: {
			target: "ES2023",
			module: "ESNext",
			moduleResolution: "Bundler",
			lib: ["ES2023", "DOM"],
			strict: true,
			noEmit: true,
			skipLibCheck: true,
		},
		include: ["src", "vite.config.ts"],
	},
	viteConfig: `import { defineConfig } from 'vite'
import { rpgjsSoloBoundary } from '@jbcom/rpgjs-solo-vite'

export default defineConfig({
  plugins: [rpgjsSoloBoundary()]
})
`,
	browserEntry: `import { installCanvasEnginePatches } from '@arcade-cabinet/rpgjs-patches'
import { SoloRuntime } from '@jbcom/rpgjs-solo'
import { SoloActionBattle } from '@jbcom/rpgjs-solo-action-battle'
import { resolveInitialMute } from '@jbcom/rpgjs-solo-renderer'
import { Sprite, Viewport } from 'canvasengine'

const runtime = new SoloRuntime({ fixedStepMs: 16 })
runtime.registerMap({ id: 'release', width: 32, height: 32, entities: [{ id: 'hero', kind: 'player', x: 1, y: 1 }] })
runtime.setActiveMap('release')
if (!new SoloActionBattle(runtime).canMove('hero').available) throw new Error('action battle failed')
if (!resolveInitialMute({ autoMuteInTests: true }, true)) throw new Error('test mute failed')
if (typeof installCanvasEnginePatches !== 'function') throw new Error('patch package failed')
installCanvasEnginePatches({ Sprite, Viewport })
document.querySelector('#app')!.textContent = 'RPGJS Solo registry consumer passed'
`,
	};
};

export const verifyPublishedConsumer = (manifest, plan, env) => {
	const directory = mkdtempSync(
		join(tmpdir(), "rpgjs-solo-registry-consumer-"),
	);
	try {
		const contract = createPublishedConsumerContract(manifest, plan);
		writeJson(join(directory, "package.json"), contract.packageJson);
		writeExclusiveFile(
			join(directory, "runtime-check.mjs"),
			contract.runtimeCheck,
			0o644,
		);
		writeExclusiveFile(
			join(directory, "index.html"),
			contract.indexHtml,
			0o644,
		);
		writeJson(join(directory, "tsconfig.json"), contract.tsconfig);
		writeExclusiveFile(
			join(directory, "vite.config.ts"),
			contract.viteConfig,
			0o644,
		);
		mkdirSync(join(directory, "src"), { mode: 0o755 });
		writeExclusiveFile(
			join(directory, "src", "main.ts"),
			contract.browserEntry,
			0o644,
		);
		run("pnpm", [...publishedConsumerInstallArgs], {
			cwd: directory,
			env,
			timeout: 600_000,
		});
		run(process.execPath, ["runtime-check.mjs"], { cwd: directory, env });
		run("pnpm", ["exec", "tsc", "--noEmit"], {
			cwd: directory,
			env,
			timeout: 600_000,
		});
		run("pnpm", ["exec", "vite", "build"], {
			cwd: directory,
			env,
			timeout: 600_000,
		});
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
};

const requireExecution = (args, plan) => {
	assert(
		args.execute,
		"Remote mutation is disabled; pass --execute after reviewing the dry run",
	);
	assert(
		process.env.RPGJS_SOLO_RELEASE_CONFIRM === plan.version,
		`Set RPGJS_SOLO_RELEASE_CONFIRM=${plan.version}`,
	);
};

export const preflightCandidatePublication = (
	manifest,
	plan,
	env,
	view = pnpmView,
) =>
	manifest.packages.map((item) => {
		const tags = view(item.name, "dist-tags", plan, env) ?? {};
		assert(
			tags[plan.candidateDistTag] === undefined ||
				tags[plan.candidateDistTag] === plan.version,
			`${item.name} candidate tag already points at a different version`,
		);
		const existing = view(
			`${item.name}@${plan.version}`,
			"dist.integrity",
			plan,
			env,
		);
		if (tags[plan.candidateDistTag] === plan.version)
			assert(
				existing !== undefined,
				`${item.name} candidate tag points at a missing release version`,
			);
		if (existing !== undefined)
			assert(
				existing === item.integrity,
				`${item.name}@${plan.version} already exists with foreign bytes`,
			);
		return {
			item,
			action:
				existing === undefined
					? "publish"
					: tags[plan.candidateDistTag] === plan.version
						? "complete"
						: "tag",
		};
	});

const snapshotIntegrity = (bytes) =>
	`sha512-${createHash("sha512").update(bytes).digest("base64")}`;

export const prepareCandidatePublicationJournal = ({
	manifest,
	manifestPath,
	plan,
}) => {
	assert(
		isAbsolute(manifestPath) && plan.releaseId === manifest.releaseId,
		"Candidate publication requires the exact absolute release manifest",
	);
	const manifestState = regularFileState(
		manifestPath,
		"Candidate publication manifest",
	);
	assert(manifestState, "Candidate publication manifest is missing");
	const journalPath = `${manifestPath}.candidate-publish.json`;
	const purpose = `solo-candidate-publish:${plan.releaseId}`;
	let journal;
	if (lstatOrNull(journalPath))
		journal = readTransactionJournal(journalPath, purpose);
	else {
		journal = {
			schemaVersion: 2,
			releaseId: plan.releaseId,
			manifestSha512: manifestState.sha512,
			packages: Object.fromEntries(
				manifest.packages.map((item) => [
					item.name,
					{
						sourceArchive: item.archive,
						sha512: item.sha512,
						integrity: item.integrity,
						complete: false,
					},
				]),
			),
		};
		secureAtomicWriteJson(journalPath, journal, { purpose });
	}
	assert(
		journal.schemaVersion === 2 &&
			journal.releaseId === plan.releaseId &&
			journal.manifestSha512 === manifestState.sha512 &&
			JSON.stringify(Object.keys(journal.packages ?? {})) ===
				JSON.stringify(manifest.packages.map(({ name }) => name)),
		"Candidate publication journal belongs to different release bytes",
	);
	for (const item of manifest.packages) {
		const entry = journal.packages[item.name];
		assert(
			entry.sourceArchive === item.archive &&
				entry.sha512 === item.sha512 &&
				entry.integrity === item.integrity &&
				typeof entry.complete === "boolean",
			`Candidate publication journal drifted for ${item.name}`,
		);
	}
	return {
		journalPath,
		isComplete(name) {
			assert(journal.packages[name], `Unknown candidate package ${name}`);
			return journal.packages[name].complete;
		},
		markComplete(name) {
			assert(journal.packages[name], `Unknown candidate package ${name}`);
			journal.packages[name].complete = true;
			secureAtomicWriteJson(journalPath, journal, { purpose });
		},
	};
};

export const publishVerifiedPackageBytes = async ({
	item,
	tarballData,
	plan,
	token,
	publish = publishNpmPackage,
}) => {
	assert(
		Buffer.isBuffer(tarballData),
		"Verified package tarball bytes are required",
	);
	assert(
		item.publishManifest?.name === item.name &&
			item.publishManifest?.version === plan.version &&
			digest("sha512", tarballData) === item.sha512 &&
			snapshotIntegrity(tarballData) === item.integrity,
		`${item.name} in-memory publication bytes or manifest drifted`,
	);
	assert(token, "RPGJS_SOLO_NPM_TOKEN is required for publication");
	return publish(structuredClone(item.publishManifest), tarballData, {
		registry: plan.registry,
		token,
		forceAuth: { token },
		defaultTag: plan.candidateDistTag,
		access: null,
		npmVersion: `rpgjs-solo-release/${plan.version}`,
		algorithms: ["sha512"],
	});
};

export const publishCandidateCohort = async ({
	manifest,
	manifestPath,
	plan,
	env,
	authToken,
	view = pnpmView,
	command = run,
	beforeSnapshot = () => {},
	beforePublish = () => {},
	publisher = publishVerifiedPackageBytes,
}) => {
	const actions = preflightCandidatePublication(manifest, plan, env, view);
	beforeSnapshot({ manifest, manifestPath });
	const publication = prepareCandidatePublicationJournal({
		manifest,
		manifestPath,
		plan,
	});
	for (const { item, action } of actions) {
		assert(
			!publication.isComplete(item.name) || action === "complete",
			`${item.name} completed candidate publication has drifted in the live registry`,
		);
		if (action === "publish") {
			const sourcePath = resolve(dirname(manifestPath), item.archive);
			const artifactRoot = realpathSync(dirname(manifestPath));
			const sourceRealPath = realpathSync(sourcePath);
			assert(
				sourceRealPath.startsWith(`${artifactRoot}${sep}`),
				`${item.name} archive escaped the provenance directory`,
			);
			const publishState = regularFileState(
				sourceRealPath,
				`${item.name} publication archive`,
			);
			assert(
				publishState?.sha512 === item.sha512 &&
					snapshotIntegrity(publishState.bytes) === item.integrity,
				`${item.name} archive changed before in-memory publication capture`,
			);
			beforePublish({
				item,
				sourcePath: sourceRealPath,
				tarballData: publishState.bytes,
			});
			await publisher({
				item,
				tarballData: publishState.bytes,
				plan,
				token: authToken,
				env,
			});
		} else if (action === "tag")
			command(
				"pnpm",
				[
					"dist-tag",
					"add",
					`${item.name}@${plan.version}`,
					plan.candidateDistTag,
					"--registry",
					plan.registry,
				],
				{ env },
			);
		assert(
			view(`${item.name}@${plan.version}`, "dist.integrity", plan, env) ===
				item.integrity,
			`${item.name} fetch-back integrity failed`,
		);
		publication.markComplete(item.name);
	}
	assertCandidateCohort(manifest, plan, env, view);
};

const publishCandidate = async (manifest, manifestPath, plan, args) => {
	requireExecution(args, plan);
	await withEphemeralNpmAuth(
		process.env.RPGJS_SOLO_NPM_TOKEN,
		plan.registry,
		async (env, token) =>
			publishCandidateCohort({
				manifest,
				manifestPath,
				plan,
				env,
				authToken: token,
			}),
	);
};

const promoteLatest = async (manifest, manifestPath, plan, args) => {
	requireExecution(args, plan);
	const journalPath = `${manifestPath}.promotion.json`;
	const journalPurpose = `solo-promotion:${plan.releaseId}`;
	await withEphemeralNpmAuth(
		process.env.RPGJS_SOLO_NPM_TOKEN,
		plan.registry,
		async (env) => {
			assertCandidateCohort(manifest, plan, env);
			let journal;
			if (lstatOrNull(journalPath)) {
				journal = readTransactionJournal(journalPath, journalPurpose);
				assert(
					journal.releaseId === plan.releaseId &&
						journal.manifestSha512 === sha512File(manifestPath),
					"Promotion journal belongs to different bytes",
				);
				assert(
					JSON.stringify(Object.keys(journal.packages ?? {}).sort()) ===
						JSON.stringify(manifest.packages.map(({ name }) => name).sort()) &&
						Object.values(journal.packages).every(
							(state) =>
								state &&
								typeof state.complete === "boolean" &&
								(state.priorLatest === null ||
									typeof state.priorLatest === "string"),
						),
					"Promotion journal package state drifted",
				);
				for (const state of Object.values(journal.packages))
					assertMonotonicLatestPromotion(state.priorLatest, plan.version);
			} else {
				const snapshots = manifest.packages.map(({ name }) => {
					const tags = pnpmView(name, "dist-tags", plan, env) ?? {};
					const latest = tags[plan.promotionDistTag] ?? null;
					assertMonotonicLatestPromotion(latest, plan.version);
					return [name, latest];
				});
				journal = {
					schemaVersion: 1,
					releaseId: plan.releaseId,
					manifestSha512: sha512File(manifestPath),
					packages: Object.fromEntries(
						snapshots.map(([name, latest]) => {
							return [
								name,
								{
									priorLatest: latest,
									complete: latest === plan.version,
								},
							];
						}),
					),
				};
				secureAtomicWriteJson(journalPath, journal, {
					purpose: journalPurpose,
				});
			}
			const preflightActions = manifest.packages.map((item) => {
				const state = journal.packages[item.name];
				const tags = pnpmView(item.name, "dist-tags", plan, env) ?? {};
				const currentLatest = tags[plan.promotionDistTag] ?? null;
				assertMonotonicLatestPromotion(currentLatest, plan.version);
				return {
					item,
					action: nextPromotionAction({
						currentLatest,
						priorLatest: state.priorLatest,
						version: plan.version,
						complete: state.complete,
					}),
				};
			});
			for (const { item, action: preflightAction } of preflightActions) {
				const state = journal.packages[item.name];
				const liveBeforeMutation =
					pnpmView(item.name, "dist-tags", plan, env) ?? {};
				const action = nextPromotionAction({
					currentLatest: liveBeforeMutation[plan.promotionDistTag] ?? null,
					priorLatest: state.priorLatest,
					version: plan.version,
					complete: state.complete,
				});
				assert(
					action === preflightAction ||
						(preflightAction === "promote" && action === "complete"),
					`${item.name} latest changed after cohort preflight`,
				);
				if (action === "promote")
					run(
						"pnpm",
						[
							"dist-tag",
							"add",
							`${item.name}@${plan.version}`,
							plan.promotionDistTag,
							"--registry",
							plan.registry,
						],
						{ env },
					);
				const verified = pnpmView(item.name, "dist-tags", plan, env);
				assert(
					verified?.[plan.promotionDistTag] === plan.version,
					`${item.name} latest promotion did not persist`,
				);
				state.complete = true;
				secureAtomicWriteJson(journalPath, journal, {
					purpose: journalPurpose,
				});
			}
			for (const item of manifest.packages) {
				const live = pnpmView(item.name, "dist-tags", plan, env);
				journal.packages[item.name].complete =
					live?.[plan.promotionDistTag] === plan.version;
			}
			journal.complete = Object.values(journal.packages).every(
				({ complete }) => complete,
			);
			assert(
				journal.complete,
				"Live registry reconciliation found an incomplete latest promotion",
			);
			secureAtomicWriteJson(journalPath, journal, {
				purpose: journalPurpose,
			});
		},
	);
};

const errorLooksMissing = (error) =>
	/404|not found|does not exist|no release|unknown revision|needed a single revision|ambiguous argument/i.test(
		`${error?.message ?? ""}\n${error?.stdout ?? ""}\n${error?.stderr ?? ""}`,
	);

const repositorySlug = (repository) => {
	const path = new URL(repository).pathname
		.replace(/^\//, "")
		.replace(/\.git$/, "");
	assert(/^[^/]+\/[^/]+$/.test(path), `Invalid repository URL ${repository}`);
	return path;
};

const remoteTagTarget = (repository, tag, command = run) => {
	const output = command(
		"git",
		[
			"ls-remote",
			"--tags",
			repository,
			`refs/tags/${tag}`,
			`refs/tags/${tag}^{}`,
		],
		{ cwd: rootDirectory },
	);
	const references = new Map(
		output
			.split("\n")
			.filter(Boolean)
			.map((line) => line.split(/\s+/, 2).reverse()),
	);
	return (
		references.get(`refs/tags/${tag}^{}`) ?? references.get(`refs/tags/${tag}`)
	);
};

const reconcileRemoteTags = (repository, tags, commit, command = run) => {
	for (const tag of tags) {
		const current = remoteTagTarget(repository, tag, command);
		assert(
			current === undefined || current === commit,
			`${tag} already points at a different remote commit`,
		);
		if (current === undefined)
			command(
				"git",
				["push", repository, `refs/tags/${tag}:refs/tags/${tag}`],
				{ cwd: rootDirectory },
			);
		assert(
			remoteTagTarget(repository, tag, command) === commit,
			`${tag} remote tag verification failed`,
		);
	}
};

const reconcileLocalTags = (tags, commit, command = run) => {
	for (const tag of tags) {
		let current;
		try {
			current = command("git", ["rev-parse", `${tag}^{}`], {
				cwd: rootDirectory,
			});
		} catch (error) {
			if (!errorLooksMissing(error)) throw error;
		}
		assert(
			current === undefined || current === commit,
			`${tag} points at a different local commit`,
		);
		if (current === undefined)
			command("git", ["tag", tag, commit], { cwd: rootDirectory });
		assert(
			command("git", ["rev-parse", `${tag}^{}`], {
				cwd: rootDirectory,
			}) === commit,
			`${tag} local tag verification failed`,
		);
	}
};

export const prepareReleaseEvidence = (
	manifest,
	manifestPath,
	plan,
	{ writeNotes = true } = {},
) => {
	const notesPath = join(
		dirname(manifestPath),
		`${plan.releaseId}.release-notes.md`,
	);
	const notes = `# RPGJS Solo ${plan.version}\n\nCanonical source: ${manifest.source.commit}\nTree: ${manifest.source.tree}\nUpstream RPGJS baseline: ${manifest.source.upstreamCommit}\nProvenance SHA-512: ${sha512File(manifestPath)}\n`;
	const sourcePaths = [
		manifestPath,
		`${manifestPath}.sha512`,
		attestationPaths(manifestPath).statement,
		attestationPaths(manifestPath).signature,
		...(manifest.reviewReceipt
			? [
					resolve(dirname(manifestPath), manifest.reviewReceipt.statement),
					resolve(dirname(manifestPath), manifest.reviewReceipt.signature),
				]
			: []),
		...manifest.packages.map(({ archive }) =>
			resolve(dirname(manifestPath), archive),
		),
	];
	const sourceStates = sourcePaths.map((path) => {
		const state = regularFileState(path, `Release evidence ${basename(path)}`);
		assert(state, `Release evidence is missing: ${path}`);
		return { path, state };
	});
	const notesState = regularFileState(notesPath, "Release-note output", {
		owner: currentUid(),
		mode: 0o644,
	});
	if (notesState)
		assert(
			notesState.bytes.equals(Buffer.from(notes)),
			"Existing release-note output has foreign bytes",
		);
	const names = [
		...sourcePaths.map((path) => basename(path)),
		basename(notesPath),
	];
	assert(new Set(names).size === names.length, "Release asset names collide");
	if (writeNotes && !notesState)
		ensureExactFile(notesPath, notes, 0o644, "Release-note output");
	const assets = sourceStates.map(({ path, state }) => ({
		path,
		name: basename(path),
		sha512: state.sha512,
	}));
	assets.push({
		path: notesPath,
		name: basename(notesPath),
		sha512: digest("sha512", notes),
	});
	return {
		tag: plan.trainTag,
		target: manifest.source.commit,
		title: `RPGJS Solo ${plan.version}`,
		body: notes,
		notesPath,
		prerelease: true,
		assets,
	};
};

const assertReleaseMetadata = (release, expected, provider, draft) => {
	assert(release, `${provider} release is missing after creation`);
	assert(release.tag === expected.tag, `${provider} release tag drifted`);
	assert(
		release.target === expected.target,
		`${provider} release target drifted`,
	);
	assert(release.title === expected.title, `${provider} release title drifted`);
	assert(release.body === expected.body, `${provider} release notes drifted`);
	assert(
		release.prerelease === expected.prerelease && release.draft === draft,
		`${provider} release state drifted`,
	);
};

const indexReleaseAssets = (release, expected, provider, allowMissing) => {
	const byName = new Map();
	for (const asset of release.assets ?? []) {
		assert(
			!byName.has(asset.name),
			`${provider} release has duplicate asset ${asset.name}`,
		);
		byName.set(asset.name, asset);
	}
	const expectedNames = new Set(expected.assets.map(({ name }) => name));
	const extra = [...byName.keys()].filter((name) => !expectedNames.has(name));
	assert(
		extra.length === 0,
		`${provider} release has foreign assets: ${extra}`,
	);
	if (!allowMissing) {
		const missing = [...expectedNames].filter((name) => !byName.has(name));
		assert(
			missing.length === 0,
			`${provider} release is missing assets: ${missing}`,
		);
	}
	return byName;
};

const verifyRemoteAsset = async (
	adapter,
	release,
	remoteAsset,
	expectedAsset,
) => {
	const directory = mkdtempSync(join(tmpdir(), "rpgjs-solo-release-fetch-"));
	try {
		const destination = join(directory, expectedAsset.name);
		await adapter.downloadAsset(release, remoteAsset, destination);
		assert(
			existsSync(destination) &&
				sha512File(destination) === expectedAsset.sha512,
			`${adapter.name} release asset ${expectedAsset.name} has foreign bytes`,
		);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
};

export const reconcileReleaseWithAdapter = async (expected, adapter) => {
	let release = await adapter.getRelease(expected.tag);
	if (release && release.draft === false) {
		assertReleaseMetadata(release, expected, adapter.name, false);
		const publishedAssets = indexReleaseAssets(
			release,
			expected,
			adapter.name,
			false,
		);
		for (const expectedAsset of expected.assets)
			await verifyRemoteAsset(
				adapter,
				release,
				publishedAssets.get(expectedAsset.name),
				expectedAsset,
			);
		return {
			tag: expected.tag,
			assets: expected.assets.map(({ name }) => name),
		};
	}
	if (!release) {
		await adapter.createDraftRelease(expected);
		release = await adapter.getRelease(expected.tag);
	}
	assertReleaseMetadata(release, expected, adapter.name, true);
	let assets = indexReleaseAssets(release, expected, adapter.name, true);
	for (const expectedAsset of expected.assets) {
		const existing = assets.get(expectedAsset.name);
		if (existing)
			await verifyRemoteAsset(adapter, release, existing, expectedAsset);
	}
	for (const expectedAsset of expected.assets)
		if (!assets.has(expectedAsset.name))
			await adapter.uploadAsset(release, expectedAsset);
	release = await adapter.getRelease(expected.tag);
	assertReleaseMetadata(release, expected, adapter.name, true);
	assets = indexReleaseAssets(release, expected, adapter.name, false);
	for (const expectedAsset of expected.assets)
		await verifyRemoteAsset(
			adapter,
			release,
			assets.get(expectedAsset.name),
			expectedAsset,
		);
	await adapter.publishRelease(release, expected);
	release = await adapter.getRelease(expected.tag);
	assertReleaseMetadata(release, expected, adapter.name, false);
	assets = indexReleaseAssets(release, expected, adapter.name, false);
	for (const expectedAsset of expected.assets)
		await verifyRemoteAsset(
			adapter,
			release,
			assets.get(expectedAsset.name),
			expectedAsset,
		);
	return { tag: expected.tag, assets: expected.assets.map(({ name }) => name) };
};

export const reconcileReleaseRemotes = async ({
	expected,
	remotes,
	onVerified = () => {},
}) => {
	const result = {};
	for (const adapter of remotes) {
		result[adapter.name] = await reconcileReleaseWithAdapter(expected, adapter);
		onVerified(adapter.name, result[adapter.name]);
	}
	return result;
};

export const createGitHubReleaseAdapter = (plan, command = run) => {
	const repo = repositorySlug(plan.canonical.repository);
	return {
		name: "github",
		getRelease(tag) {
			try {
				const value = JSON.parse(
					command(
						"gh",
						[
							"release",
							"view",
							tag,
							"--json",
							"tagName,targetCommitish,name,body,isDraft,isPrerelease,assets",
							"-R",
							repo,
						],
						{ timeout: 600_000 },
					),
				);
				return {
					tag: value.tagName,
					target: value.targetCommitish,
					title: value.name,
					body: value.body,
					draft: value.isDraft,
					prerelease: value.isPrerelease,
					assets: value.assets ?? [],
				};
			} catch (error) {
				if (errorLooksMissing(error)) return undefined;
				throw error;
			}
		},
		createDraftRelease(expected) {
			command(
				"gh",
				[
					"release",
					"create",
					expected.tag,
					"--draft",
					"--prerelease",
					"--verify-tag",
					"--latest=false",
					"--target",
					expected.target,
					"--title",
					expected.title,
					"--notes-file",
					expected.notesPath,
					"-R",
					repo,
				],
				{ timeout: 600_000 },
			);
		},
		publishRelease(_release, expected) {
			command(
				"gh",
				["release", "edit", expected.tag, "--draft=false", "-R", repo],
				{ timeout: 600_000 },
			);
		},
		uploadAsset(_release, asset) {
			command(
				"gh",
				["release", "upload", plan.trainTag, asset.path, "-R", repo],
				{ timeout: 600_000 },
			);
		},
		downloadAsset(_release, asset, destination) {
			command(
				"gh",
				[
					"release",
					"download",
					plan.trainTag,
					"--pattern",
					asset.name,
					"--output",
					destination,
					"-R",
					repo,
				],
				{ timeout: 600_000 },
			);
		},
	};
};

export const createGiteaReleaseAdapter = (plan, command = run) => {
	const repo = plan.backup.apiRepository;
	assert(/^[^/]+\/[^/]+$/.test(repo), "Invalid Gitea API repository");
	const endpoint = `repos/${repo}/releases`;
	return {
		name: "gitea",
		getRelease(tag) {
			try {
				const value = JSON.parse(
					command(
						"tea",
						[
							"api",
							`${endpoint}/tags/${encodeURIComponent(tag)}`,
							"--repo",
							repo,
						],
						{ timeout: 600_000 },
					),
				);
				return {
					id: value.id,
					tag: value.tag_name,
					target: value.target_commitish,
					title: value.name,
					body: value.body,
					draft: value.draft,
					prerelease: value.prerelease,
					assets: value.assets ?? [],
				};
			} catch (error) {
				if (errorLooksMissing(error)) return undefined;
				throw error;
			}
		},
		createDraftRelease(expected) {
			command(
				"tea",
				[
					"releases",
					"create",
					"--tag",
					expected.tag,
					"--target",
					expected.target,
					"--title",
					expected.title,
					"--note-file",
					expected.notesPath,
					"--draft",
					"--prerelease",
					"--repo",
					repo,
				],
				{ timeout: 600_000 },
			);
		},
		publishRelease(_release, expected) {
			command(
				"tea",
				[
					"releases",
					"edit",
					expected.tag,
					"--tag",
					expected.tag,
					"--target",
					expected.target,
					"--title",
					expected.title,
					"--note",
					expected.body,
					"--draft=false",
					"--prerelease=true",
					"--repo",
					repo,
				],
				{ timeout: 600_000 },
			);
		},
		uploadAsset(_release, asset) {
			command(
				"tea",
				[
					"releases",
					"assets",
					"create",
					plan.trainTag,
					asset.path,
					"--repo",
					repo,
				],
				{ timeout: 600_000 },
			);
		},
		downloadAsset(_release, asset, destination) {
			assert(
				typeof asset.browser_download_url === "string" &&
					asset.browser_download_url.startsWith("https://") &&
					new URL(asset.browser_download_url).hostname ===
						new URL(plan.backup.repository).hostname,
				`Gitea asset ${asset.name} has no authenticated download URL`,
			);
			command(
				"tea",
				[
					"api",
					asset.browser_download_url,
					"--output",
					destination,
					"--repo",
					repo,
				],
				{ timeout: 600_000 },
			);
		},
	};
};

const publishReleases = async (manifest, manifestPath, plan, args) => {
	requireExecution(args, plan);
	const expected = prepareReleaseEvidence(manifest, manifestPath, plan, {
		writeNotes: false,
	});
	const journalPath = `${manifestPath}.releases.json`;
	const journalPurpose = `solo-source-releases:${plan.releaseId}`;
	const identity = {
		schemaVersion: 1,
		releaseId: plan.releaseId,
		manifestSha512: sha512File(manifestPath),
		assets: Object.fromEntries(
			expected.assets.map(({ name, sha512 }) => [name, sha512]),
		),
	};
	let journal;
	if (lstatOrNull(journalPath)) {
		journal = readTransactionJournal(journalPath, journalPurpose);
		assert(
			journal.releaseId === identity.releaseId &&
				journal.manifestSha512 === identity.manifestSha512 &&
				JSON.stringify(journal.assets) === JSON.stringify(identity.assets) &&
				journal.remotes &&
				typeof journal.remotes === "object" &&
				!Array.isArray(journal.remotes),
			"Source release journal belongs to different evidence bytes",
		);
	} else {
		journal = { ...identity, remotes: {} };
	}
	await withEphemeralNpmAuth(
		process.env.RPGJS_SOLO_NPM_TOKEN,
		plan.registry,
		async (env) => assertLivePromotedCohort(manifest, plan, env),
	);
	if (!lstatOrNull(journalPath))
		secureAtomicWriteJson(journalPath, journal, { purpose: journalPurpose });
	ensureExactFile(
		expected.notesPath,
		expected.body,
		0o644,
		"Release-note output",
	);
	const tags = [...plan.packages.map(({ tag }) => tag), plan.trainTag];
	reconcileLocalTags(tags, manifest.source.commit);
	reconcileRemoteTags(plan.canonical.repository, tags, manifest.source.commit);
	const github = createGitHubReleaseAdapter(plan);
	const gitea = createGiteaReleaseAdapter(plan);
	await reconcileReleaseRemotes({
		expected,
		remotes: [github],
		onVerified(name, result) {
			journal.remotes[name] = result;
			secureAtomicWriteJson(journalPath, journal, { purpose: journalPurpose });
		},
	});
	reconcileRemoteTags(plan.backup.repository, tags, manifest.source.commit);
	await reconcileReleaseRemotes({
		expected,
		remotes: [gitea],
		onVerified(name, result) {
			journal.remotes[name] = result;
			secureAtomicWriteJson(journalPath, journal, { purpose: journalPurpose });
		},
	});
	journal.complete = ["github", "gitea"].every(
		(name) => journal.remotes[name]?.tag === plan.trainTag,
	);
	assert(journal.complete, "Source release reconciliation is incomplete");
	secureAtomicWriteJson(journalPath, journal, { purpose: journalPurpose });
};

const parseArguments = (raw) => {
	const command = raw[0] ?? "validate";
	const args = { command, execute: false, plan: defaultPlanPath };
	for (let index = 1; index < raw.length; index++) {
		if (raw[index] === "--") continue;
		if (raw[index] === "--execute") args.execute = true;
		else if (raw[index] === "--plan") args.plan = resolve(raw[++index]);
		else if (raw[index] === "--artifacts")
			args.artifacts = resolve(raw[++index]);
		else if (raw[index] === "--manifest") args.manifest = resolve(raw[++index]);
		else throw new Error(`Unknown argument ${raw[index]}`);
	}
	return args;
};

export const main = async (
	rawArguments = process.argv.slice(2),
	{ toolchainCommand = run, nodeVersion = process.versions.node } = {},
) => {
	assertReleaseToolchain(toolchainCommand, nodeVersion);
	const args = parseArguments(rawArguments);
	assert(
		resolve(args.plan) === defaultPlanPath,
		"Production release commands require the canonical reviewed plan path",
	);
	const plan = loadSoloReleasePlan(args.plan);
	assertReviewedPlanSource(plan, args.plan);
	if (args.command === "validate") {
		assertFinalReleaseBindings(plan);
		process.stdout.write(
			`${JSON.stringify(validateSoloReleaseState(rootDirectory, plan), null, 2)}\n`,
		);
		return;
	}
	if (args.command === "apply") {
		assertFinalReleaseBindings(plan);
		const result = applySoloReleaseTransaction(rootDirectory, plan);
		process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
		return;
	}
	if (args.command === "pack") {
		assert(args.artifacts, "pack requires --artifacts");
		assert(
			validateSoloReleaseState(rootDirectory, plan).phase === "applied",
			"pack requires the applied version phase",
		);
		const source = assertCanonicalMain(rootDirectory, plan);
		const result = createProvenanceManifest({
			root: rootDirectory,
			plan,
			artifactsDirectory: args.artifacts,
			source,
		});
		process.stdout.write(`${result.manifestPath}\n`);
		return;
	}
	assert(args.manifest, `${args.command} requires --manifest`);
	const manifest = loadProvenance(args.manifest, plan);
	const source = assertCanonicalMain(rootDirectory, plan);
	assert(
		source.head === manifest.source.commit &&
			source.tree === manifest.source.tree &&
			JSON.stringify(source.reviewEvidence) ===
				JSON.stringify(manifest.source.reviewEvidence),
		"Canonical source differs from provenance",
	);
	if (!args.execute) {
		process.stdout.write(
			`DRY RUN: ${args.command} ${plan.releaseId}; add --execute and the exact confirmation environment value after review.\n`,
		);
		return;
	}
	if (args.command === "publish")
		await publishCandidate(manifest, args.manifest, plan, args);
	else if (args.command === "verify-candidate") {
		requireExecution(args, plan);
		await withEphemeralNpmAuth(
			process.env.RPGJS_SOLO_NPM_TOKEN,
			plan.registry,
			async (env) => {
				assertCandidateCohort(manifest, plan, env);
				verifyPublishedConsumer(manifest, plan, env);
			},
		);
	} else if (args.command === "promote")
		await promoteLatest(manifest, args.manifest, plan, args);
	else if (args.command === "publish-releases")
		await publishReleases(manifest, args.manifest, plan, args);
	else throw new Error(`Unknown release command ${args.command}`);
};

if (
	process.argv[1] &&
	realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	main().catch((error) => {
		process.stderr.write(`Solo release refused: ${error.message}\n`);
		process.exitCode = 1;
	});
}
