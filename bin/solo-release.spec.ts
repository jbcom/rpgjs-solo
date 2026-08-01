import { execFileSync } from "node:child_process";
import {
	createHash,
	generateKeyPairSync,
	randomUUID,
	sign as signBytes,
} from "node:crypto";
import {
	chmodSync,
	closeSync,
	existsSync,
	fchmodSync,
	constants as fsConstants,
	fstatSync,
	fsyncSync,
	linkSync,
	mkdirSync,
	mkdtempSync,
	openSync,
	readdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	applySoloReleaseTransaction,
	assertCanonicalMain,
	assertExactSourceWorktree,
	assertFinalReleaseBindings,
	assertLivePromotedCohort,
	assertMonotonicLatestPromotion,
	assertReleaseToolchain,
	assertReviewedCanonicalMain,
	assertReviewedPlanSource,
	createGiteaReleaseAdapter,
	createGitHubReleaseAdapter,
	createProvenanceManifest,
	defaultPlanPath,
	loadProvenance,
	loadSoloReleasePlan,
	main,
	nextPromotionAction,
	normalizeCommandOutput,
	pnpmView,
	prepareReleaseEvidence,
	publishCandidateCohort,
	publishedConsumerInstallArgs,
	publishVerifiedPackageBytes,
	readTransactionJournal,
	reconcileReleaseRemotes,
	reconcileReleaseWithAdapter,
	secureAtomicWriteJson,
	sha512File,
	validateSoloReleaseState,
	verifyExternalOrchestratorAssignment,
	verifyIndependentReviewReceipt,
	withEphemeralNpmAuth,
} from "./solo-release.mjs";

const registry = "https://git.local.jonbogaty.com/api/packages/jbcom/npm/";
const previousVersion = "5.0.0-beta.29.solo.0";
const version = "5.0.0-beta.29.solo.1";
const packages = [
	{
		name: "@jbcom/rpgjs-solo",
		directory: "packages/solo",
		tag: `rpgjs-solo-v${version}`,
	},
	{
		name: "@jbcom/rpgjs-solo-action-battle",
		directory: "packages/solo-action-battle",
		tag: `rpgjs-solo-action-battle-v${version}`,
	},
	{
		name: "@jbcom/rpgjs-solo-renderer",
		directory: "packages/solo-renderer",
		tag: `rpgjs-solo-renderer-v${version}`,
	},
	{
		name: "@jbcom/rpgjs-solo-vite",
		directory: "packages/solo-vite",
		tag: `rpgjs-solo-vite-v${version}`,
	},
];
const inheritedReleaseDirectories = [
	"packages/common",
	"packages/server",
	"packages/client",
	"packages/action-battle",
	"packages/studio",
	"packages/tiledmap",
	"packages/vite",
];
const temporaryDirectories: string[] = [];
const sha256 = (value: string) =>
	createHash("sha256").update(value).digest("hex");
const testReviewKeys = generateKeyPairSync("ed25519");
const testReviewPublicKeyPem = testReviewKeys.publicKey
	.export({
		type: "spki",
		format: "pem",
	})
	.toString();
const testReviewKeyId = createHash("sha256")
	.update(testReviewKeys.publicKey.export({ type: "spki", format: "der" }))
	.digest("hex");
const testReviewSigner = (value: Buffer) =>
	signBytes(null, value, testReviewKeys.privateKey);
const testOrchestratorKeys = generateKeyPairSync("ed25519");
const testOrchestratorPublicKeyPem = testOrchestratorKeys.publicKey
	.export({ type: "spki", format: "pem" })
	.toString();
const testOrchestratorKeyId = createHash("sha256")
	.update(
		testOrchestratorKeys.publicKey.export({ type: "spki", format: "der" }),
	)
	.digest("hex");
const testOrchestratorRawPublicKey = Buffer.from(
	testOrchestratorKeys.publicKey.export({ type: "spki", format: "der" }),
).subarray(-32);
const testOrchestratorRawKeyId = createHash("sha256")
	.update(testOrchestratorRawPublicKey)
	.digest("hex");
const testProvenanceKeys = generateKeyPairSync("ed25519");
const testProvenancePublicKeyPem = testProvenanceKeys.publicKey
	.export({
		type: "spki",
		format: "pem",
	})
	.toString();
const testProvenanceKeyId = createHash("sha256")
	.update(testProvenanceKeys.publicKey.export({ type: "spki", format: "der" }))
	.digest("hex");
const testProvenanceSigner = (value: Buffer) =>
	signBytes(null, value, testProvenanceKeys.privateKey);
const writeTestFile = (
	path: string,
	value: string | NodeJS.ArrayBufferView,
	mode = 0o644,
) => {
	const temporaryPath = join(
		dirname(path),
		`.${basename(path)}.${randomUUID()}.tmp`,
	);
	const descriptor = openSync(
		temporaryPath,
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
	renameSync(temporaryPath, path);
};
const writeJson = (path: string, value: unknown) =>
	writeTestFile(path, `${JSON.stringify(value, null, 2)}\n`);
const inspectTestFile = (path: string) => {
	const descriptor = openSync(path, "r");
	try {
		const state = fstatSync(descriptor);
		return {
			mode: state.mode & 0o777,
			text: readFileSync(descriptor, "utf8"),
		};
	} finally {
		closeSync(descriptor);
	}
};

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0))
		rmSync(directory, { recursive: true, force: true });
	delete process.env.RPGJS_SOLO_ORCHESTRATOR_TRUST_ROOT_PATH;
	delete process.env.RPGJS_SOLO_ORCHESTRATOR_TRUST_ROOT_KEY_ID;
	delete process.env.RPGJS_SOLO_ORCHESTRATOR_ASSIGNMENT_PATH;
	delete process.env.RPGJS_SOLO_REVIEW_RECEIPT_PATH;
});

const changeset = (releases: string[], summary: string) =>
	`---\n${releases.map((name) => `"${name}": patch`).join("\n")}\n---\n\n${summary}\n`;

function createFixture() {
	const root = mkdtempSync(join(tmpdir(), "solo-release-fixture-"));
	temporaryDirectories.push(root);
	mkdirSync(join(root, ".changeset"));
	writeFileSync(
		join(root, ".changeset/README.md"),
		"# Changesets\n\nRun `pnpm changeset` for user-facing changes.\n",
	);
	writeJson(join(root, ".changeset/pre.json"), { changesets: [] });
	writeFileSync(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
	writeFileSync(
		join(root, "pnpm-workspace.yaml"),
		"packages:\n  - 'packages/*'\n",
	);
	const consumedSources = {
		solo: changeset(
			packages.map(({ name }) => name),
			"Coordinated Solo release.",
		),
		runtime: changeset(["@jbcom/rpgjs-solo"], "Atomic runtime."),
		renderer: changeset(["@jbcom/rpgjs-solo-renderer"], "Reactive props."),
	};
	const carriedSources = {
		client: changeset(["@rpgjs/client"], "Portable client."),
		action: changeset(
			["@rpgjs/action-battle", "@rpgjs/client"],
			"Combat feedback.",
		),
		studio: changeset(["@rpgjs/studio"], "Studio percentage semantics."),
	};
	for (const [id, source] of Object.entries({
		...consumedSources,
		...carriedSources,
	})) {
		writeFileSync(join(root, `.changeset/${id}.md`), source);
	}
	for (const record of packages) {
		mkdirSync(join(root, record.directory), { recursive: true });
		const dependencies = [
			"@jbcom/rpgjs-solo-action-battle",
			"@jbcom/rpgjs-solo-renderer",
		].includes(record.name)
			? { "@jbcom/rpgjs-solo": `workspace:${previousVersion}` }
			: undefined;
		writeJson(join(root, record.directory, "package.json"), {
			name: record.name,
			version: previousVersion,
			private: false,
			repository: {
				type: "git",
				url: "git+https://github.com/jbcom/rpgjs-solo.git",
				directory: record.directory,
			},
			homepage: `https://github.com/jbcom/rpgjs-solo/tree/main/${record.directory}#readme`,
			bugs: { url: "https://github.com/jbcom/rpgjs-solo/issues" },
			engines: { node: ">=24 <25" },
			publishConfig: { registry },
			type: "module",
			main: "./dist/index.js",
			types: "./dist/index.d.ts",
			exports: {
				".": {
					types: "./dist/index.d.ts",
					import: "./dist/index.js",
				},
				"./package.json": "./package.json",
			},
			files: ["dist"],
			...(dependencies ? { dependencies } : {}),
		});
	}
	for (const [index, directory] of inheritedReleaseDirectories.entries()) {
		mkdirSync(join(root, directory), { recursive: true });
		writeJson(join(root, directory, "package.json"), {
			name: [
				"@rpgjs/common",
				"@rpgjs/server",
				"@rpgjs/client",
				"@rpgjs/action-battle",
				"@rpgjs/studio",
				"@rpgjs/tiledmap",
				"@rpgjs/vite",
			][index],
			version: "5.0.0-beta.29",
		});
	}
	mkdirSync(join(root, "playground/games/solo"), { recursive: true });
	writeJson(join(root, "playground/games/solo/package.json"), {
		name: "fixture",
		private: true,
		dependencies: { "@jbcom/rpgjs-solo": `workspace:${previousVersion}` },
	});
	const consumedChangesets = Object.entries(consumedSources).map(
		([id, source]) => ({ id, sha256: sha256(source) }),
	);
	const carriedChangesets = Object.entries(carriedSources).map(
		([id, source]) => ({
			id,
			sha256: sha256(source),
			...(id === "studio" ? { introducedBy: "4".repeat(40) } : {}),
		}),
	);
	const plan = {
		schemaVersion: 2,
		releaseId: "fixture",
		sourceBaseCommit: "2".repeat(40),
		requiredSourceCommit: "2".repeat(40),
		sourceBinding: { status: "final" },
		reviewEvidence: {
			status: "final",
			enginePullRequest: {
				repository: "jbcom/rpgjs-solo",
				number: 20,
				mergeCommit: "2".repeat(40),
				minimumApprovals: 1,
				requiredChecks: ["tests (24)"],
			},
			releasePullRequest: {
				repository: "jbcom/rpgjs-solo",
				number: 21,
				mergeCommitBinding: "canonical-head",
				minimumApprovals: 1,
				requiredChecks: ["tests (24)"],
			},
			independentReceipt: {
				status: "final",
				algorithm: "ed25519",
				orchestratorAssignment: {
					schemaVersion: 1,
					status: "final",
					trustRootPathEnvironment: "RPGJS_SOLO_ORCHESTRATOR_TRUST_ROOT_PATH",
					trustRootKeyIdEnvironment:
						"RPGJS_SOLO_ORCHESTRATOR_TRUST_ROOT_KEY_ID",
					assignmentPathEnvironment: "RPGJS_SOLO_ORCHESTRATOR_ASSIGNMENT_PATH",
					requiredReviewerRole: "independent-release-auditor",
				},
			},
		},
		provenanceAttestation: {
			status: "final",
			algorithm: "ed25519",
			keyId: testProvenanceKeyId,
			publicKeyPem: testProvenancePublicKeyPem,
		},
		upstreamCommit: "3".repeat(40),
		previousVersion,
		version,
		registry,
		candidateDistTag: "candidate",
		promotionDistTag: "latest",
		trainTag: `solo-v${version}`,
		canonical: {
			repository: "https://github.com/jbcom/rpgjs-solo.git",
			branch: "main",
		},
		backup: {
			repository: "ssh://gitea/repo.git",
			apiRepository: "jbcom/rpgjs-solo",
		},
		packages,
		inheritedReleaseDirectories,
		consumedChangesets,
		carriedChangesets,
		requiredConsumer: {
			package: "@arcade-cabinet/rpgjs-patches",
			version: "0.2.0",
		},
	};
	const planPath = join(root, "plan.json");
	writeJson(planPath, plan);
	const trustDirectory = mkdtempSync(
		join(tmpdir(), "solo-orchestrator-trust-"),
	);
	temporaryDirectories.push(trustDirectory);
	const trustRootPath = join(trustDirectory, "trust-root.json");
	writeJson(trustRootPath, {
		schemaVersion: 1,
		trustDomain: "jbcom/rpgjs-solo-release-orchestrator",
		algorithm: "ed25519",
		keyId: testOrchestratorKeyId,
		publicKeyPem: testOrchestratorPublicKeyPem,
	});
	chmodSync(trustRootPath, 0o600);
	const assignment = {
		schemaVersion: 1,
		algorithm: "ed25519",
		trustRootKeyId: testOrchestratorKeyId,
		releaseId: plan.releaseId,
		version: plan.version,
		producerTaskId: "/root/solo_release_transaction_audit",
		producerPrincipalId: "producer-fixture",
		reviewerTaskId: "/root/solo_fix_release_review",
		reviewerPrincipalId: "reviewer-fixture",
		reviewerRole: "independent-release-auditor",
		reviewerForkId: "fork-solo-fix-release-review",
		reviewerKeyId: testReviewKeyId,
		reviewerPublicKeyPem: testReviewPublicKeyPem,
	};
	const assignmentPath = join(trustDirectory, "assignment.json");
	writeJson(assignmentPath, assignment);
	chmodSync(assignmentPath, 0o600);
	writeFileSync(
		`${assignmentPath}.sig`,
		`${signBytes(null, readFileSync(assignmentPath), testOrchestratorKeys.privateKey).toString("base64")}\n`,
	);
	chmodSync(`${assignmentPath}.sig`, 0o600);
	process.env.RPGJS_SOLO_ORCHESTRATOR_TRUST_ROOT_PATH = trustRootPath;
	process.env.RPGJS_SOLO_ORCHESTRATOR_TRUST_ROOT_KEY_ID = testOrchestratorKeyId;
	process.env.RPGJS_SOLO_ORCHESTRATOR_ASSIGNMENT_PATH = assignmentPath;
	return {
		root,
		planPath,
		carriedSources,
		trustRootPath,
		assignmentPath,
		assignment,
	};
}

function initializeFixtureGit(
	fixture: ReturnType<typeof createFixture>,
	plan: ReturnType<typeof loadSoloReleasePlan>,
) {
	execFileSync("git", ["init", "-q"], { cwd: fixture.root });
	execFileSync("git", ["config", "user.email", "release@example.test"], {
		cwd: fixture.root,
	});
	execFileSync("git", ["config", "user.name", "Release Fixture"], {
		cwd: fixture.root,
	});
	execFileSync("git", ["add", "."], { cwd: fixture.root });
	execFileSync("git", ["commit", "-qm", "fixture"], { cwd: fixture.root });
	const head = execFileSync("git", ["rev-parse", "HEAD"], {
		cwd: fixture.root,
		encoding: "utf8",
	}).trim();
	plan.sourceBaseCommit = head;
	plan.requiredSourceCommit = head;
	plan.upstreamCommit = head;
	plan.reviewEvidence.enginePullRequest.mergeCommit = head;
	for (const entry of plan.carriedChangesets) entry.introducedBy = head;
	return head;
}

function applyFixtureRelease(
	fixture: ReturnType<typeof createFixture>,
	plan: ReturnType<typeof loadSoloReleasePlan>,
) {
	initializeFixtureGit(fixture, plan);
	return applySoloReleaseTransaction(fixture.root, plan, undefined, {
		targetLockfileFactory: () => "deterministic-lock\n",
	});
}

function commitAppliedFixture(fixture: ReturnType<typeof createFixture>) {
	execFileSync("git", ["add", "-A"], { cwd: fixture.root });
	execFileSync("git", ["commit", "-qm", "apply Solo release"], {
		cwd: fixture.root,
	});
	return {
		head: execFileSync("git", ["rev-parse", "HEAD"], {
			cwd: fixture.root,
			encoding: "utf8",
		}).trim(),
		tree: execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
			cwd: fixture.root,
			encoding: "utf8",
		}).trim(),
	};
}

function createExpectedRelease() {
	const directory = mkdtempSync(join(tmpdir(), "solo-release-evidence-"));
	temporaryDirectories.push(directory);
	const paths = [join(directory, "one.tgz"), join(directory, "two.json")];
	writeFileSync(paths[0], "archive-one\n");
	writeFileSync(paths[1], "manifest-two\n");
	return {
		tag: "solo-vfixture",
		target: "a".repeat(40),
		title: "Fixture release",
		body: "Fixture notes\n",
		notesPath: paths[1],
		prerelease: true,
		assets: paths.map((path) => ({
			path,
			name: path.split("/").at(-1) ?? "",
			sha512: sha512File(path),
		})),
	};
}

function createCandidateFixture() {
	const directory = mkdtempSync(join(tmpdir(), "solo-candidate-fixture-"));
	temporaryDirectories.push(directory);
	const releaseId = "candidate-fixture";
	const manifest = {
		releaseId,
		packages: packages.map(({ name }, index) => {
			const archive = `${index}.tgz`;
			const bytes = Buffer.from(`candidate archive ${index}\n`);
			writeFileSync(join(directory, archive), bytes);
			return {
				name,
				archive,
				sha512: createHash("sha512").update(bytes).digest("hex"),
				integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
				publishManifest: { name, version },
			};
		}),
	};
	const manifestPath = join(directory, "provenance.json");
	writeJson(manifestPath, manifest);
	return { directory, releaseId, manifest, manifestPath };
}

function createReleaseAdapter(
	name: string,
	expected: ReturnType<typeof createExpectedRelease>,
	options: {
		existing?: boolean;
		failCreateOnce?: boolean;
		failUploadAt?: number;
		failPublishAfterOnce?: boolean;
	} = {},
) {
	let release = options.existing
		? {
				tag: expected.tag,
				target: expected.target,
				title: expected.title,
				body: expected.body,
				draft: false,
				prerelease: true,
			}
		: undefined;
	const bytes = new Map<string, Buffer>();
	if (options.existing)
		for (const asset of expected.assets)
			bytes.set(asset.name, readFileSync(asset.path));
	let failCreate = options.failCreateOnce === true;
	let failPublishAfter = options.failPublishAfterOnce === true;
	const calls = {
		create: 0,
		upload: 0,
		download: 0,
		publish: 0,
		order: [] as string[],
	};
	return {
		name,
		calls,
		getRelease() {
			return release
				? {
						...release,
						assets: [...bytes.keys()].map((assetName, index) => ({
							id: index + 1,
							name: assetName,
						})),
					}
				: undefined;
		},
		createDraftRelease() {
			calls.create += 1;
			calls.order.push("create-draft");
			if (failCreate) {
				failCreate = false;
				throw new Error(`${name} temporarily unavailable`);
			}
			release = {
				tag: expected.tag,
				target: expected.target,
				title: expected.title,
				body: expected.body,
				draft: true,
				prerelease: true,
			};
		},
		uploadAsset(_release: unknown, asset: { name: string; path: string }) {
			if (release?.draft !== true)
				throw new Error(`${name} immutable published release rejected upload`);
			calls.upload += 1;
			calls.order.push(`upload:${asset.name}`);
			if (calls.upload === options.failUploadAt)
				throw new Error(`${name} upload interrupted`);
			bytes.set(asset.name, readFileSync(asset.path));
		},
		downloadAsset(
			_release: unknown,
			asset: { name: string },
			destination: string,
		) {
			calls.download += 1;
			calls.order.push(
				`download:${release?.draft === true ? "draft" : "published"}:${asset.name}`,
			);
			writeTestFile(destination, bytes.get(asset.name) ?? Buffer.alloc(0));
		},
		publishRelease() {
			calls.publish += 1;
			calls.order.push("publish");
			if (!release || release.draft !== true)
				throw new Error(`${name} release is not a draft`);
			if (bytes.size !== expected.assets.length)
				throw new Error(`${name} release assets are incomplete`);
			release.draft = false;
			if (failPublishAfter) {
				failPublishAfter = false;
				throw new Error(`${name} publish response was interrupted`);
			}
		},
	};
}

describe("Solo beta.29 coordinated release transaction", () => {
	it("normalizes inherited-stdio command results without trimming null", () => {
		expect(normalizeCommandOutput(null)).toBe("");
		expect(normalizeCommandOutput(undefined, false)).toBe("");
		expect(normalizeCommandOutput("  output  ")).toBe("output");
		expect(normalizeCommandOutput("  output  ", false)).toBe("  output  ");
	});

	it("isolates the published consumer from an unrelated parent pnpm workspace", () => {
		const parent = mkdtempSync(join(tmpdir(), "solo-parent-workspace-"));
		temporaryDirectories.push(parent);
		const consumer = join(parent, "consumer");
		const fixture = join(parent, "fixture");
		mkdirSync(consumer);
		mkdirSync(fixture);
		writeJson(join(parent, "package.json"), {
			name: "unrelated-parent",
			private: true,
		});
		writeTestFile(
			join(parent, "pnpm-workspace.yaml"),
			"packages:\n  - packages/**\n",
		);
		writeJson(join(fixture, "package.json"), {
			name: "solo-consumer-fixture",
			version: "1.0.0",
		});
		writeJson(join(consumer, "package.json"), {
			name: "solo-consumer",
			private: true,
			dependencies: {
				"solo-consumer-fixture": "file:../fixture",
			},
		});

		execFileSync("pnpm", ["install", "--ignore-scripts"], {
			cwd: consumer,
			stdio: "pipe",
		});
		expect(existsSync(join(consumer, "node_modules"))).toBe(false);

		execFileSync("pnpm", [...publishedConsumerInstallArgs], {
			cwd: consumer,
			stdio: "pipe",
		});
		expect(
			existsSync(
				join(consumer, "node_modules", "solo-consumer-fixture", "package.json"),
			),
		).toBe(true);
	});

	it("fails closed unless the executing toolchain is exact Node 24 and pnpm 11.18.0", () => {
		const exactToolchain = (_program: string, args: string[]) =>
			args[0] === "--version"
				? "11.18.0"
				: JSON.stringify({ version: "24.18.1", execPath: process.execPath });
		expect(
			assertReleaseToolchain(exactToolchain, "24.18.1", process.execPath),
		).toEqual({
			nodeVersion: "24.18.1",
			nodeExecPath: process.execPath,
			pnpmVersion: "11.18.0",
			childNodeVersion: "24.18.1",
			childNodeExecPath: process.execPath,
		});
		expect(() =>
			assertReleaseToolchain(exactToolchain, "26.5.0", process.execPath),
		).toThrow(/requires Node 24/i);
		expect(() =>
			assertReleaseToolchain(() => "11.17.0", "24.18.1", process.execPath),
		).toThrow(/requires pnpm 11\.18\.0/i);
		expect(() =>
			assertReleaseToolchain(
				(_program, args) =>
					args[0] === "--version"
						? "11.18.0"
						: JSON.stringify({ version: "26.5.0", execPath: "/usr/bin/false" }),
				"24.18.1",
				process.execPath,
			),
		).toThrow(/pnpm child runtime must be the exact Node 24/i);
	});

	it("admits only the canonical plan path and exact reviewed HEAD bytes", async () => {
		const externalDirectory = mkdtempSync(
			join(tmpdir(), "solo-external-plan-"),
		);
		temporaryDirectories.push(externalDirectory);
		const externalPlan = join(externalDirectory, "substituted-plan.json");
		writeFileSync(externalPlan, readFileSync(defaultPlanPath));
		await expect(
			main(["validate", "--plan", externalPlan], {
				toolchainCommand: (_program, args) =>
					args[0] === "--version"
						? "11.18.0"
						: JSON.stringify({
								version: process.versions.node,
								execPath: process.execPath,
							}),
				nodeVersion: "24.18.1",
			}),
		).rejects.toThrow(/canonical reviewed plan path/i);

		const root = mkdtempSync(join(tmpdir(), "solo-reviewed-plan-"));
		temporaryDirectories.push(root);
		const planPath = join(
			root,
			"docs/internal/releases",
			basename(defaultPlanPath),
		);
		mkdirSync(dirname(planPath), { recursive: true });
		writeFileSync(planPath, readFileSync(defaultPlanPath));
		execFileSync("git", ["init", "-q"], { cwd: root });
		execFileSync("git", ["config", "user.email", "release@example.test"], {
			cwd: root,
		});
		execFileSync("git", ["config", "user.name", "Release Fixture"], {
			cwd: root,
		});
		execFileSync("git", ["add", "."], { cwd: root });
		execFileSync("git", ["commit", "-qm", "reviewed plan"], { cwd: root });
		const reviewed = loadSoloReleasePlan(planPath);
		expect(assertReviewedPlanSource(reviewed, planPath, root)).toMatchObject({
			path: planPath,
			sha512: reviewed.planSha512,
		});
		writeFileSync(
			planPath,
			Buffer.concat([readFileSync(planPath), Buffer.from("\n")]),
		);
		const substituted = loadSoloReleasePlan(planPath);
		expect(() => assertReviewedPlanSource(substituted, planPath, root)).toThrow(
			/exact reviewed HEAD blob/i,
		);
	});

	it("rejects traversal or aliasing in the fixed Solo package cohort", () => {
		const directory = mkdtempSync(join(tmpdir(), "solo-plan-traversal-"));
		temporaryDirectories.push(directory);
		const path = join(directory, "plan.json");
		const plan = JSON.parse(readFileSync(defaultPlanPath, "utf8"));
		plan.packages[0].directory = "packages/../../outside";
		writeJson(path, plan);
		expect(() => loadSoloReleasePlan(path)).toThrow(
			/package order, directory, or immutable tag drifted/i,
		);
	});

	it("pins one beta.29 Solo increment to the exact engine merge and release PR", () => {
		const plan = loadSoloReleasePlan();
		expect(plan.previousVersion).toBe(previousVersion);
		expect(plan.version).toBe(version);
		expect(plan.requiredSourceCommit).toBe(
			"82a9e56d106e87c37df4602055a6a22ec22218dc",
		);
		expect(plan.sourceBaseCommit).toBe(plan.requiredSourceCommit);
		expect(plan.reviewEvidence.enginePullRequest.mergeCommit).toBe(
			plan.requiredSourceCommit,
		);
		expect(plan.reviewEvidence.releasePullRequest.number).toBe(23);
		expect(
			plan.carriedChangesets.find(
				({ id }: { id: string }) => id === "fair-studio-success-rates",
			)?.introducedBy,
		).toBe("f0144127fe43c264638ca2699b8bfcd3cd55fea6");
		expect(plan.inheritedReleaseDirectories).toEqual(
			inheritedReleaseDirectories,
		);
		expect(plan.sourceBinding.status).toBe("final");
		expect(plan.reviewEvidence.status).toBe("final");
		expect(plan.reviewEvidence.independentReceipt.status).toBe("final");
		expect(
			plan.reviewEvidence.independentReceipt.orchestratorAssignment.status,
		).toBe("final");
		expect(plan.provenanceAttestation.status).toBe("final");
		expect(assertFinalReleaseBindings(plan)).toEqual({
			sourceBinding: "final",
			reviewEvidence: "final",
			independentReceipt: "final",
			orchestratorAssignment: "final",
			provenanceAttestation: "final",
		});
	});

	it("keeps reviewer trust outside the plan and authenticates a producer-disjoint detached assignment", () => {
		const fixture = createFixture();
		const source = JSON.parse(readFileSync(fixture.planPath, "utf8"));
		expect(
			verifyExternalOrchestratorAssignment(
				loadSoloReleasePlan(fixture.planPath),
				{
					repositoryRoot: fixture.root,
				},
			),
		).toMatchObject({
			trustRootKeyId: testOrchestratorKeyId,
			reviewerKeyId: testReviewKeyId,
			assignment: { reviewerPrincipalId: "reviewer-fixture" },
		});

		const smuggledKey = structuredClone(source);
		smuggledKey.reviewEvidence.independentReceipt.keyId = testReviewKeyId;
		smuggledKey.reviewEvidence.independentReceipt.publicKeyPem =
			testReviewPublicKeyPem;
		writeJson(fixture.planPath, smuggledKey);
		expect(() => loadSoloReleasePlan(fixture.planPath)).toThrow(
			/must not select orchestrator trust input keyId/i,
		);

		writeJson(fixture.planPath, source);
		process.env.RPGJS_SOLO_ORCHESTRATOR_TRUST_ROOT_KEY_ID = "f".repeat(64);
		expect(() =>
			verifyExternalOrchestratorAssignment(
				loadSoloReleasePlan(fixture.planPath),
				{
					repositoryRoot: fixture.root,
				},
			),
		).toThrow(/runtime fingerprint pin/i);
		process.env.RPGJS_SOLO_ORCHESTRATOR_TRUST_ROOT_KEY_ID =
			testOrchestratorKeyId;
		const sameTask = { ...fixture.assignment };
		sameTask.reviewerTaskId = sameTask.producerTaskId;
		writeJson(fixture.assignmentPath, sameTask);
		chmodSync(fixture.assignmentPath, 0o600);
		writeFileSync(
			`${fixture.assignmentPath}.sig`,
			`${signBytes(null, readFileSync(fixture.assignmentPath), testOrchestratorKeys.privateKey).toString("base64")}\n`,
		);
		chmodSync(`${fixture.assignmentPath}.sig`, 0o600);
		expect(() =>
			verifyExternalOrchestratorAssignment(
				loadSoloReleasePlan(fixture.planPath),
				{
					repositoryRoot: fixture.root,
				},
			),
		).toThrow(/producer-disjoint release/i);

		const missingAssignment = structuredClone(source);
		delete missingAssignment.reviewEvidence.independentReceipt
			.orchestratorAssignment;
		writeJson(fixture.planPath, missingAssignment);
		expect(() => loadSoloReleasePlan(fixture.planPath)).toThrow(
			/configuration is incomplete/i,
		);
	});

	it("rejects forged detached assignments, substituted reviewer keys, and in-repository trust inputs", () => {
		for (const attack of [
			"signature",
			"reviewer-key",
			"inside-repository",
			"inside-via-parent-symlink",
		]) {
			const fixture = createFixture();
			const plan = loadSoloReleasePlan(fixture.planPath);
			if (attack === "signature") {
				writeFileSync(
					`${fixture.assignmentPath}.sig`,
					`${Buffer.alloc(64).toString("base64")}\n`,
				);
				chmodSync(`${fixture.assignmentPath}.sig`, 0o600);
			} else if (attack === "reviewer-key") {
				const assignment = {
					...fixture.assignment,
					reviewerKeyId: testProvenanceKeyId,
					reviewerPublicKeyPem: testProvenancePublicKeyPem,
				};
				writeJson(fixture.assignmentPath, assignment);
				chmodSync(fixture.assignmentPath, 0o600);
				writeFileSync(
					`${fixture.assignmentPath}.sig`,
					`${signBytes(null, readFileSync(fixture.assignmentPath), testOrchestratorKeys.privateKey).toString("base64")}\n`,
				);
				chmodSync(`${fixture.assignmentPath}.sig`, 0o600);
			} else {
				const inside = join(fixture.root, "trust-root.json");
				writeFileSync(inside, readFileSync(fixture.trustRootPath));
				chmodSync(inside, 0o600);
				if (attack === "inside-via-parent-symlink") {
					const aliasDirectory = mkdtempSync(
						join(tmpdir(), "solo-repo-alias-"),
					);
					temporaryDirectories.push(aliasDirectory);
					const alias = join(aliasDirectory, "repo");
					symlinkSync(fixture.root, alias);
					process.env.RPGJS_SOLO_ORCHESTRATOR_TRUST_ROOT_PATH = join(
						alias,
						"trust-root.json",
					);
				} else process.env.RPGJS_SOLO_ORCHESTRATOR_TRUST_ROOT_PATH = inside;
			}
			expect(() =>
				verifyExternalOrchestratorAssignment(plan, {
					repositoryRoot: fixture.root,
				}),
			).toThrow(
				attack === "signature"
					? /signature is invalid/i
					: attack === "reviewer-key"
						? /reviewer key is invalid|not distinct/i
						: /outside the producer repository/i,
			);
		}
	});

	it("accepts the fleet's normative raw Ed25519 trust-root representation and fingerprint", () => {
		const fixture = createFixture();
		writeJson(fixture.trustRootPath, {
			schemaVersion: "arcade-cabinet.orchestrator-trust-root/v1",
			trustRootId: "arcade-cabinet-orchestrator-assignment-ed25519-v1",
			status: "ACTIVE",
			normativeArtifact: true,
			scope: ["jbcom-rpgjs-solo-release-review-assignment"],
			publicKey: {
				algorithm: "Ed25519",
				encoding: "raw-base64-rfc4648-canonical-with-padding",
				rawBytes: 32,
				value: testOrchestratorRawPublicKey.toString("base64"),
				sha256: testOrchestratorRawKeyId,
			},
		});
		chmodSync(fixture.trustRootPath, 0o600);
		const assignment = {
			...fixture.assignment,
			trustRootKeyId: testOrchestratorRawKeyId,
		};
		writeJson(fixture.assignmentPath, assignment);
		chmodSync(fixture.assignmentPath, 0o600);
		writeFileSync(
			`${fixture.assignmentPath}.sig`,
			`${signBytes(null, readFileSync(fixture.assignmentPath), testOrchestratorKeys.privateKey).toString("base64")}\n`,
		);
		chmodSync(`${fixture.assignmentPath}.sig`, 0o600);
		process.env.RPGJS_SOLO_ORCHESTRATOR_TRUST_ROOT_KEY_ID =
			testOrchestratorRawKeyId;
		expect(
			verifyExternalOrchestratorAssignment(
				loadSoloReleasePlan(fixture.planPath),
				{ repositoryRoot: fixture.root },
			),
		).toMatchObject({
			trustRootKeyId: testOrchestratorRawKeyId,
			trustRootRepresentation: "raw",
		});
	});

	it("applies only the cohort once, preserves inherited changesets, and never creates beta.30", () => {
		const fixture = createFixture();
		const plan = loadSoloReleasePlan(fixture.planPath);
		expect(validateSoloReleaseState(fixture.root, plan).phase).toBe("source");
		expect(applyFixtureRelease(fixture, plan)).toMatchObject({
			changed: true,
			phase: "applied",
		});
		expect(
			applySoloReleaseTransaction(fixture.root, plan, undefined, {
				targetLockfileFactory: () => "deterministic-lock\n",
			}),
		).toEqual({
			changed: false,
			phase: "applied",
			lockfileRefreshed: false,
			appliedBoundaries: 0,
		});
		for (const record of packages) {
			const manifest = JSON.parse(
				readFileSync(
					join(fixture.root, record.directory, "package.json"),
					"utf8",
				),
			);
			expect(manifest.version).toBe(version);
			expect(
				readFileSync(
					join(fixture.root, record.directory, "CHANGELOG.md"),
					"utf8",
				),
			).not.toContain("beta.30");
		}
		for (const [id, source] of Object.entries(fixture.carriedSources)) {
			expect(
				readFileSync(join(fixture.root, `.changeset/${id}.md`), "utf8"),
			).toBe(source);
		}
	});

	it("preflights every changelog before mutating a manifest", () => {
		const fixture = createFixture();
		const plan = loadSoloReleasePlan(fixture.planPath);
		const manifestPath = join(
			fixture.root,
			packages[0].directory,
			"package.json",
		);
		const before = readFileSync(manifestPath, "utf8");
		writeFileSync(
			join(fixture.root, packages.at(-1)?.directory ?? "", "CHANGELOG.md"),
			"foreign\n",
		);
		initializeFixtureGit(fixture, plan);
		expect(() =>
			applySoloReleaseTransaction(fixture.root, plan, undefined, {
				targetLockfileFactory: () => "deterministic-lock\n",
			}),
		).toThrow(/changelog already exists in HEAD/i);
		expect(readFileSync(manifestPath, "utf8")).toBe(before);
		expect(existsSync(join(fixture.root, ".changeset/solo.md"))).toBe(true);
	});

	it("resumes after every manifest, changelog, deletion, and lockfile boundary", () => {
		const baseline = createFixture();
		const baselinePlan = loadSoloReleasePlan(baseline.planPath);
		initializeFixtureGit(baseline, baselinePlan);
		const boundaries: Array<{ kind: string; path: string }> = [];
		const completed = applySoloReleaseTransaction(
			baseline.root,
			baselinePlan,
			undefined,
			{
				targetLockfileFactory: () => "deterministic-lock\n",
				afterBoundary: ({ kind, path }) => boundaries.push({ kind, path }),
			},
		);
		expect(completed.appliedBoundaries).toBe(boundaries.length);
		expect(new Set(boundaries.map(({ kind }) => kind))).toEqual(
			new Set(["manifest", "changelog", "changeset-delete", "lockfile"]),
		);

		for (
			let failureIndex = 0;
			failureIndex < boundaries.length;
			failureIndex++
		) {
			const fixture = createFixture();
			const plan = loadSoloReleasePlan(fixture.planPath);
			initializeFixtureGit(fixture, plan);
			let seen = 0;
			expect(() =>
				applySoloReleaseTransaction(fixture.root, plan, undefined, {
					targetLockfileFactory: () => "deterministic-lock\n",
					afterBoundary: () => {
						if (seen++ === failureIndex)
							throw new Error("injected interruption");
					},
				}),
			).toThrow(/injected interruption/);
			expect(
				applySoloReleaseTransaction(fixture.root, plan, undefined, {
					targetLockfileFactory: () => "deterministic-lock\n",
				}),
			).toMatchObject({ phase: "applied", lockfileRefreshed: true });
			expect(validateSoloReleaseState(fixture.root, plan).phase).toBe(
				"applied",
			);
			expect(
				existsSync(join(fixture.root, ".rpgjs-solo-release-apply.json")),
			).toBe(false);
		}
	}, 30_000);

	it("recovers secure transaction-owned writes interrupted before journal or output rename", () => {
		for (const failureKind of ["journal", "manifest"]) {
			const fixture = createFixture();
			const plan = loadSoloReleasePlan(fixture.planPath);
			initializeFixtureGit(fixture, plan);
			let interrupted = false;
			expect(() =>
				applySoloReleaseTransaction(fixture.root, plan, undefined, {
					targetLockfileFactory: () => "deterministic-lock\n",
					beforeRename: ({ kind }) => {
						if (!interrupted && kind === failureKind) {
							interrupted = true;
							throw new Error(`crash before ${failureKind} rename`);
						}
					},
				}),
			).toThrow(`crash before ${failureKind} rename`);
			expect(
				applySoloReleaseTransaction(fixture.root, plan, undefined, {
					targetLockfileFactory: () => "deterministic-lock\n",
				}),
			).toMatchObject({ phase: "applied" });
			expect(
				execFileSync("find", [fixture.root, "-name", "*.solo-txn-*"], {
					encoding: "utf8",
				}).trim(),
			).toBe("");
		}
	});

	it("rejects precreated journal targets and temporary-path symlinks", () => {
		const directory = mkdtempSync(join(tmpdir(), "solo-secure-journal-"));
		temporaryDirectories.push(directory);
		const external = join(directory, "external.json");
		writeFileSync(external, "external\n");
		const targetSymlink = join(directory, "target.json");
		symlinkSync(external, targetSymlink);
		expect(() =>
			secureAtomicWriteJson(
				targetSymlink,
				{ releaseId: "fixture" },
				{ purpose: "promotion:fixture" },
			),
		).toThrow(/regular non-symlink file/i);
		expect(readFileSync(external, "utf8")).toBe("external\n");

		const journal = join(directory, "journal.json");
		const forgedTemp = join(directory, ".journal.json.solo-txn-forged");
		symlinkSync(directory, forgedTemp);
		expect(() =>
			secureAtomicWriteJson(
				journal,
				{ releaseId: "fixture" },
				{ purpose: "promotion:fixture" },
			),
		).toThrow(/temporary path is forged or unsafe/i);
	});

	it("recovers shared promotion/release journal writes without manual cleanup", () => {
		const directory = mkdtempSync(join(tmpdir(), "solo-journal-recovery-"));
		temporaryDirectories.push(directory);
		const path = join(directory, "promotion.json");
		const value = { schemaVersion: 1, releaseId: "fixture", complete: false };
		expect(() =>
			secureAtomicWriteJson(path, value, {
				purpose: "promotion:fixture",
				beforeRename: () => {
					throw new Error("crash before journal rename");
				},
			}),
		).toThrow(/crash before journal rename/i);
		secureAtomicWriteJson(path, value, { purpose: "promotion:fixture" });
		expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(value);
		expect(statSync(path).mode & 0o777).toBe(0o600);
		expect(readdirSync(directory).sort()).toEqual(["promotion.json"]);
	});

	it("preserves every unmarked, mismatched, or hard-linked transaction lookalike", () => {
		const directory = mkdtempSync(join(tmpdir(), "solo-unproven-txn-"));
		temporaryDirectories.push(directory);
		const unmarkedTarget = join(directory, "unmarked.json");
		const unmarked = join(directory, ".unmarked.json.solo-txn-forged");
		mkdirSync(unmarked, { mode: 0o700 });
		writeFileSync(join(unmarked, "payload"), "unproven bytes\n");
		const before = readFileSync(join(unmarked, "payload"));
		expect(() =>
			secureAtomicWriteJson(
				unmarkedTarget,
				{ releaseId: "fixture" },
				{ purpose: "promotion:fixture" },
			),
		).toThrow(/unmarked transaction temporary state was preserved/i);
		expect(readFileSync(join(unmarked, "payload"))).toEqual(before);

		const mismatchTarget = join(directory, "mismatch.json");
		expect(() =>
			secureAtomicWriteJson(
				mismatchTarget,
				{ releaseId: "first" },
				{
					purpose: "promotion:fixture",
					beforeRename: () => {
						throw new Error("interrupted mismatch");
					},
				},
			),
		).toThrow(/interrupted mismatch/i);
		const mismatchTemp = readdirSync(directory).find((name) =>
			name.startsWith(".mismatch.json.solo-txn-"),
		);
		expect(mismatchTemp).toBeDefined();
		expect(() =>
			secureAtomicWriteJson(
				mismatchTarget,
				{ releaseId: "second" },
				{ purpose: "promotion:fixture" },
			),
		).toThrow(/different desired bytes/i);
		expect(existsSync(join(directory, mismatchTemp ?? ""))).toBe(true);

		const markerTarget = join(directory, "marker.json");
		let markerPath = "";
		expect(() =>
			secureAtomicWriteJson(
				markerTarget,
				{ releaseId: "fixture" },
				{
					purpose: "promotion:fixture",
					beforeRename: ({ markerPath: path }) => {
						markerPath = path;
						linkSync(path, join(directory, "marker-hardlink.json"));
						throw new Error("interrupted marker");
					},
				},
			),
		).toThrow(/interrupted marker/i);
		expect(() =>
			secureAtomicWriteJson(
				markerTarget,
				{ releaseId: "fixture" },
				{ purpose: "promotion:fixture" },
			),
		).toThrow(/forged or unsafe|exactly one hard link/i);
		expect(existsSync(markerPath)).toBe(true);
		expect(existsSync(join(directory, "marker-hardlink.json"))).toBe(true);
	});

	it("rejects hard-linked journals and apply outputs without mutating their external peer", () => {
		const directory = mkdtempSync(join(tmpdir(), "solo-hardlink-journal-"));
		temporaryDirectories.push(directory);
		const journal = join(directory, "journal.json");
		secureAtomicWriteJson(
			journal,
			{ schemaVersion: 1, releaseId: "fixture" },
			{ purpose: "promotion:fixture" },
		);
		const journalPeer = join(directory, "journal-peer.json");
		linkSync(journal, journalPeer);
		expect(() => readTransactionJournal(journal, "promotion:fixture")).toThrow(
			/exactly one hard link/i,
		);

		const fixture = createFixture();
		const plan = loadSoloReleasePlan(fixture.planPath);
		initializeFixtureGit(fixture, plan);
		let firstPath = "";
		expect(() =>
			applySoloReleaseTransaction(fixture.root, plan, undefined, {
				targetLockfileFactory: () => "deterministic-lock\n",
				afterBoundary: ({ path }) => {
					firstPath = path;
					throw new Error("pause for hardlink attack");
				},
			}),
		).toThrow(/pause for hardlink attack/i);
		const applyJournal = JSON.parse(
			readFileSync(
				join(fixture.root, ".rpgjs-solo-release-apply.json"),
				"utf8",
			),
		);
		const victim = applyJournal.outputs.find(
			(output: {
				path: string;
				source: { exists: boolean };
				target: { exists: boolean };
			}) =>
				output.path !== firstPath &&
				output.source.exists &&
				output.target.exists,
		);
		expect(victim).toBeDefined();
		const victimPath = join(fixture.root, victim.path);
		const external = join(directory, "apply-peer.json");
		writeFileSync(
			external,
			execFileSync("git", ["show", `HEAD:${victim.path}`], {
				cwd: fixture.root,
			}),
		);
		const externalBefore = readFileSync(external);
		rmSync(victimPath);
		linkSync(external, victimPath);
		expect(() =>
			applySoloReleaseTransaction(fixture.root, plan, undefined, {
				targetLockfileFactory: () => "deterministic-lock\n",
			}),
		).toThrow(/outside the exact source\/target transaction/i);
		expect(readFileSync(external)).toEqual(externalBefore);
	});

	it("rejects foreign bytes inside an interrupted apply transaction", () => {
		const fixture = createFixture();
		const plan = loadSoloReleasePlan(fixture.planPath);
		initializeFixtureGit(fixture, plan);
		let firstPath = "";
		expect(() =>
			applySoloReleaseTransaction(fixture.root, plan, undefined, {
				targetLockfileFactory: () => "deterministic-lock\n",
				afterBoundary: ({ path }) => {
					firstPath = path;
					throw new Error("stop after one boundary");
				},
			}),
		).toThrow(/stop after one boundary/);
		writeFileSync(join(fixture.root, firstPath), "foreign bytes\n");
		expect(() =>
			applySoloReleaseTransaction(fixture.root, plan, undefined, {
				targetLockfileFactory: () => "deterministic-lock\n",
			}),
		).toThrow(/outside the exact source\/target transaction/i);
	});

	it("rejects exact-byte external symlinks and mode substitution for apply outputs", () => {
		for (const attack of ["symlink", "mode"]) {
			const fixture = createFixture();
			const plan = loadSoloReleasePlan(fixture.planPath);
			initializeFixtureGit(fixture, plan);
			let firstPath = "";
			expect(() =>
				applySoloReleaseTransaction(fixture.root, plan, undefined, {
					targetLockfileFactory: () => "deterministic-lock\n",
					afterBoundary: ({ path }) => {
						firstPath = path;
						throw new Error("pause transaction");
					},
				}),
			).toThrow(/pause transaction/i);
			const journal = JSON.parse(
				readFileSync(
					join(fixture.root, ".rpgjs-solo-release-apply.json"),
					"utf8",
				),
			);
			const victim = journal.outputs.find(
				(output: {
					path: string;
					source: { exists: boolean };
					target: { exists: boolean };
				}) =>
					output.path !== firstPath &&
					output.source.exists &&
					output.target.exists,
			);
			expect(victim).toBeDefined();
			const victimPath = join(fixture.root, victim.path);
			if (attack === "symlink") {
				const externalDirectory = mkdtempSync(
					join(tmpdir(), "solo-apply-external-"),
				);
				temporaryDirectories.push(externalDirectory);
				const external = join(externalDirectory, "exact-source.json");
				writeFileSync(
					external,
					execFileSync("git", ["show", `HEAD:${victim.path}`], {
						cwd: fixture.root,
					}),
				);
				const before = readFileSync(external);
				rmSync(victimPath);
				symlinkSync(external, victimPath);
				expect(() =>
					applySoloReleaseTransaction(fixture.root, plan, undefined, {
						targetLockfileFactory: () => "deterministic-lock\n",
					}),
				).toThrow(/outside the exact source\/target transaction/i);
				expect(readFileSync(external)).toEqual(before);
			} else {
				chmodSync(victimPath, 0o600);
				expect(() =>
					applySoloReleaseTransaction(fixture.root, plan, undefined, {
						targetLockfileFactory: () => "deterministic-lock\n",
					}),
				).toThrow(/outside the exact source\/target transaction/i);
			}
		}
	});

	it("derives the full inherited release surface and rejects undeclared work", () => {
		const fixture = createFixture();
		const plan = loadSoloReleasePlan(fixture.planPath);
		for (const name of [
			"@rpgjs/common",
			"@rpgjs/server",
			"@rpgjs/client",
			"@rpgjs/action-battle",
			"@rpgjs/studio",
			"@rpgjs/tiledmap",
			"@rpgjs/vite",
		]) {
			writeFileSync(
				join(fixture.root, ".changeset/sneaky.md"),
				changeset([name], "Unreviewed."),
			);
			expect(() => validateSoloReleaseState(fixture.root, plan)).toThrow(
				/undeclared release-relevant changeset/i,
			);
			rmSync(join(fixture.root, ".changeset/sneaky.md"));
		}
	});

	it("ignores only the standard Changesets README and rejects another malformed markdown input", () => {
		const fixture = createFixture();
		const plan = loadSoloReleasePlan(fixture.planPath);
		expect(() => validateSoloReleaseState(fixture.root, plan)).not.toThrow();
		writeFileSync(
			join(fixture.root, ".changeset/not-a-changeset.md"),
			"# This is not a changeset\n",
		);
		expect(() => validateSoloReleaseState(fixture.root, plan)).toThrow(
			/not-a-changeset has an invalid changeset document/i,
		);
	});

	it("rejects hash drift before writing", () => {
		const fixture = createFixture();
		const plan = loadSoloReleasePlan(fixture.planPath);
		initializeFixtureGit(fixture, plan);
		writeFileSync(
			join(fixture.root, ".changeset/runtime.md"),
			`${readFileSync(join(fixture.root, ".changeset/runtime.md"))}tamper`,
		);
		expect(() =>
			applySoloReleaseTransaction(fixture.root, plan, undefined, {
				targetLockfileFactory: () => "deterministic-lock\n",
			}),
		).toThrow(/SHA-256/i);
	});

	it("asserts exact clean GitHub and Gitea main plus reviewed ancestry", () => {
		const fixture = createFixture();
		const plan = loadSoloReleasePlan(fixture.planPath);
		const calls: string[] = [];
		const fake = (program: string, args: string[]) => {
			calls.push(args.join(" "));
			if (program === "gh" && args[0] === "pr") {
				const number = Number(args[2]);
				const baseRefOid = number === 20 ? "e".repeat(40) : "f".repeat(40);
				const headRefOid = number === 20 ? "c".repeat(40) : "d".repeat(40);
				return JSON.stringify({
					state: "MERGED",
					isDraft: false,
					baseRefName: "main",
					baseRefOid,
					headRefOid,
					mergeCommit: {
						oid: number === 20 ? plan.requiredSourceCommit : "a".repeat(40),
					},
					reviewDecision: "APPROVED",
					reviews: [{ state: "APPROVED" }],
					statusCheckRollup: [{ name: "tests (24)", conclusion: "SUCCESS" }],
				});
			}
			if (program === "gh" && args[0] === "api")
				return JSON.stringify({
					data: {
						repository: {
							pullRequest: {
								reviewThreads: {
									nodes: [{ isResolved: true }],
									pageInfo: { hasNextPage: false },
								},
							},
						},
					},
				});
			if (args[0] === "status") return "";
			if (args[0] === "branch") return "main";
			if (args[0] === "ls-remote") return `${"a".repeat(40)}\trefs/heads/main`;
			if (args[0] === "show" && args[2] === "--format=%P")
				return args[3] === plan.requiredSourceCommit
					? `${"e".repeat(40)} ${"c".repeat(40)}`
					: `${"f".repeat(40)} ${"d".repeat(40)}`;
			if (args[1] === "HEAD^{tree}") return "b".repeat(40);
			if (args[0] === "merge-base") return "";
			return "a".repeat(40);
		};
		expect(assertCanonicalMain(fixture.root, plan, fake)).toMatchObject({
			head: "a".repeat(40),
			tree: "b".repeat(40),
			reviewEvidence: {
				engine: { githubApproved: true },
				release: { githubApproved: true },
				independentReceipt: null,
			},
		});
		expect(calls.filter((call) => call.startsWith("ls-remote"))).toHaveLength(
			2,
		);
		expect(calls).toContain(
			`ls-remote ${plan.backup.repository} refs/heads/main`,
		);
		expect(calls.some((call) => call.startsWith("ls-remote ls-remote"))).toBe(
			false,
		);
		expect(calls).toContain(
			`merge-base --is-ancestor ${plan.sourceBaseCommit} ${plan.requiredSourceCommit}`,
		);
		expect(calls).toContain(
			`merge-base --is-ancestor ${plan.carriedChangesets.find(({ id }: { id: string }) => id === "studio").introducedBy} ${plan.requiredSourceCommit}`,
		);
	});

	it("accepts a signed producer-disjoint review receipt when lawful GitHub approval is unavailable", () => {
		const fixture = createFixture();
		const plan = loadSoloReleasePlan(fixture.planPath);
		const head = "a".repeat(40);
		const directory = mkdtempSync(join(tmpdir(), "solo-review-receipt-"));
		temporaryDirectories.push(directory);
		const receiptPath = join(directory, "receipt.json");
		const previous = process.env.RPGJS_SOLO_REVIEW_RECEIPT_PATH;
		const assignment = fixture.assignment;
		const assignmentSha512 = sha512File(fixture.assignmentPath);
		const writeReceipt = (
			overrides: Record<string, unknown> = {},
			signer = testReviewSigner,
		) => {
			const receipt = {
				schemaVersion: 1,
				algorithm: "ed25519",
				keyId: testReviewKeyId,
				verdict: "ACCEPT",
				releaseId: plan.releaseId,
				version: plan.version,
				enginePullRequest: plan.reviewEvidence.enginePullRequest.number,
				engineMergeCommit: plan.requiredSourceCommit,
				releasePullRequest: plan.reviewEvidence.releasePullRequest.number,
				releaseMergeCommit: head,
				planSha512: sha512File(plan.planPath),
				producerTaskId: assignment.producerTaskId,
				producerPrincipalId: assignment.producerPrincipalId,
				reviewerTaskId: assignment.reviewerTaskId,
				reviewerPrincipalId: assignment.reviewerPrincipalId,
				reviewerRole: assignment.reviewerRole,
				reviewerForkId: assignment.reviewerForkId,
				assignmentSha512,
				trustRootKeyId: testOrchestratorKeyId,
				...overrides,
			};
			writeJson(receiptPath, receipt);
			writeFileSync(
				`${receiptPath}.sig`,
				`${signer(readFileSync(receiptPath)).toString("base64")}\n`,
			);
			chmodSync(receiptPath, 0o600);
			chmodSync(`${receiptPath}.sig`, 0o600);
		};
		try {
			process.env.RPGJS_SOLO_REVIEW_RECEIPT_PATH = receiptPath;
			writeReceipt();
			expect(verifyIndependentReviewReceipt(plan, head)).toMatchObject({
				reviewerPrincipalId: "reviewer-fixture",
			});
			const noSelfApproval = (program: string, args: string[]) => {
				if (program === "gh" && args[0] === "pr") {
					const number = Number(args[2]);
					return JSON.stringify({
						state: "MERGED",
						isDraft: false,
						baseRefName: "main",
						baseRefOid: number === 20 ? "e".repeat(40) : "f".repeat(40),
						headRefOid: number === 20 ? "c".repeat(40) : "d".repeat(40),
						mergeCommit: {
							oid: number === 20 ? plan.requiredSourceCommit : head,
						},
						reviewDecision: "",
						reviews: [],
						statusCheckRollup: [{ name: "tests (24)", conclusion: "SUCCESS" }],
					});
				}
				if (program === "gh" && args[0] === "api")
					return JSON.stringify({
						data: {
							repository: {
								pullRequest: {
									reviewThreads: {
										nodes: [],
										pageInfo: { hasNextPage: false },
									},
								},
							},
						},
					});
				if (program === "git" && args[0] === "show")
					return args[3] === plan.requiredSourceCommit
						? `${"e".repeat(40)} ${"c".repeat(40)}`
						: `${"f".repeat(40)} ${"d".repeat(40)}`;
				throw new Error(
					`Unexpected review command ${program} ${args.join(" ")}`,
				);
			};
			expect(
				assertReviewedCanonicalMain(plan, head, noSelfApproval, fixture.root),
			).toMatchObject({
				engine: { githubApproved: false },
				release: { githubApproved: false },
				independentReceipt: { reviewerPrincipalId: "reviewer-fixture" },
			});
			writeReceipt({ reviewerPrincipalId: assignment.producerPrincipalId });
			expect(() => verifyIndependentReviewReceipt(plan, head)).toThrow(
				/producer-disjoint release/i,
			);
			writeReceipt({ reviewerTaskId: assignment.producerTaskId });
			expect(() => verifyIndependentReviewReceipt(plan, head)).toThrow(
				/producer-disjoint release/i,
			);
			writeReceipt({ reviewerForkId: undefined });
			expect(() => verifyIndependentReviewReceipt(plan, head)).toThrow(
				/exact producer-disjoint release/i,
			);
			writeReceipt({ reviewerTaskId: "/root/substituted-reviewer" });
			expect(() => verifyIndependentReviewReceipt(plan, head)).toThrow(
				/exact producer-disjoint release/i,
			);
			writeReceipt({}, testProvenanceSigner);
			expect(() => verifyIndependentReviewReceipt(plan, head)).toThrow(
				/signature is invalid/i,
			);
		} finally {
			if (previous === undefined)
				delete process.env.RPGJS_SOLO_REVIEW_RECEIPT_PATH;
			else process.env.RPGJS_SOLO_REVIEW_RECEIPT_PATH = previous;
		}
	});

	it("models resumable promotion without accepting an unexpected latest value", () => {
		expect(() =>
			assertMonotonicLatestPromotion("5.0.0-beta.26.solo.18", version),
		).not.toThrow();
		expect(() =>
			assertMonotonicLatestPromotion("5.0.0-beta.29.solo.2", version),
		).toThrow(/move latest backward/i);
		expect(() =>
			assertMonotonicLatestPromotion("5.0.0-beta.30.solo.0", version),
		).toThrow(/move latest backward/i);
		expect(() => assertMonotonicLatestPromotion("5.0.0", version)).toThrow(
			/invalid live Solo version/i,
		);
		expect(
			nextPromotionAction({
				currentLatest: "old",
				priorLatest: "old",
				version,
			}),
		).toBe("promote");
		expect(
			nextPromotionAction({
				currentLatest: version,
				priorLatest: "old",
				version,
			}),
		).toBe("complete");
		expect(() =>
			nextPromotionAction({
				currentLatest: "foreign",
				priorLatest: "old",
				version,
			}),
		).toThrow(/changed unexpectedly/);
		expect(() =>
			nextPromotionAction({
				currentLatest: "old",
				priorLatest: "old",
				version,
				complete: true,
			}),
		).toThrow(/completed latest promotion changed unexpectedly/i);
	});

	it("preflights the complete candidate cohort before any registry mutation", async () => {
		const manifest = {
			packages: packages.map(({ name }, index) => ({
				name,
				archive: `${index}.tgz`,
				integrity: `sha512-${index}`,
			})),
		};
		const plan = {
			version,
			registry,
			candidateDistTag: "candidate",
			promotionDistTag: "latest",
		};
		const mutations: string[] = [];
		const view = (spec: string, field: string) => {
			if (field === "dist-tags") return {};
			if (spec.startsWith(`${packages[2].name}@`)) return "sha512-foreign";
			return undefined;
		};
		await expect(
			publishCandidateCohort({
				manifest,
				manifestPath: "/tmp/fixture/provenance.json",
				plan,
				env: {},
				view,
				command: (command: string, args: string[]) => {
					mutations.push(`${command} ${args.join(" ")}`);
					return "";
				},
			}),
		).rejects.toThrow(/foreign bytes/i);
		expect(mutations).toEqual([]);
	});

	it("hands the exact descriptor-captured Buffer and full bound manifest to libnpmpublish", async () => {
		const candidate = createCandidateFixture();
		const item = candidate.manifest.packages[0];
		const tarballData = readFileSync(join(candidate.directory, item.archive));
		const calls: Array<{
			manifest: Record<string, unknown>;
			tarballData: Buffer;
			options: Record<string, unknown>;
		}> = [];
		await publishVerifiedPackageBytes({
			item,
			tarballData,
			plan: { version, registry, candidateDistTag: "candidate" },
			token: "fixture-token",
			publish: async (manifest, bytes, options) => {
				calls.push({ manifest, tarballData: bytes, options });
				manifest.name = "mutated only inside publisher";
			},
		});
		expect(calls).toHaveLength(1);
		expect(calls[0].tarballData).toBe(tarballData);
		expect(calls[0].options).toMatchObject({
			registry,
			token: "fixture-token",
			forceAuth: { token: "fixture-token" },
			defaultTag: "candidate",
			algorithms: ["sha512"],
		});
		expect(item.publishManifest).toEqual({ name: item.name, version });
	});

	it("refuses manifest identity, byte, and token drift before invoking libnpmpublish", async () => {
		const candidate = createCandidateFixture();
		const item = candidate.manifest.packages[0];
		const tarballData = readFileSync(join(candidate.directory, item.archive));
		let calls = 0;
		const publish = async () => {
			calls += 1;
		};
		for (const attack of [
			{
				item: {
					...item,
					publishManifest: { ...item.publishManifest, version: "0.0.0" },
				},
				tarballData,
				token: "fixture-token",
			},
			{
				item,
				tarballData: Buffer.from("foreign archive bytes\n"),
				token: "fixture-token",
			},
			{ item, tarballData, token: "" },
		])
			await expect(
				publishVerifiedPackageBytes({
					...attack,
					plan: { version, registry, candidateDistTag: "candidate" },
					publish,
				}),
			).rejects.toThrow(/drifted|required for publication/i);
		expect(calls).toBe(0);
	});

	it("executes only the immutable candidate actions selected by preflight", async () => {
		const candidate = createCandidateFixture();
		const { manifest } = candidate;
		const plan = {
			releaseId: candidate.releaseId,
			version,
			registry,
			candidateDistTag: "candidate",
			promotionDistTag: "latest",
		};
		const live = new Map<
			string,
			{ integrity: string | undefined; tags: Record<string, string> }
		>(
			manifest.packages.map(
				(
					item,
					index,
				): [
					string,
					{ integrity: string | undefined; tags: Record<string, string> },
				] => [
					item.name,
					{
						integrity: [1, 2].includes(index) ? item.integrity : undefined,
						tags: index === 2 ? { candidate: version } : {},
					},
				],
			),
		);
		const view = (spec: string, field: string) => {
			const item = manifest.packages.find(
				(candidate) =>
					spec === candidate.name || spec === `${candidate.name}@${version}`,
			);
			if (!item) throw new Error(`unknown package ${spec}`);
			const state = live.get(item.name);
			return field === "dist-tags" ? state?.tags : state?.integrity;
		};
		const mutations: string[] = [];
		await publishCandidateCohort({
			manifest,
			manifestPath: candidate.manifestPath,
			plan,
			env: {},
			view,
			publisher: ({
				item,
				tarballData,
			}: {
				item: (typeof manifest.packages)[number];
				tarballData: Buffer;
			}) => {
				mutations.push("publish");
				expect(createHash("sha512").update(tarballData).digest("hex")).toBe(
					item.sha512,
				);
				const state = live.get(item.name);
				if (!state) throw new Error("missing live state");
				state.integrity = item.integrity;
				state.tags.candidate = version;
			},
			command: (_command: string, args: string[]) => {
				mutations.push(args[0]);
				const item = manifest.packages.find(
					(candidate) => args[2] === `${candidate.name}@${version}`,
				);
				if (!item) throw new Error("missing dist-tag target");
				const state = live.get(item.name);
				if (!state) throw new Error("missing live state");
				state.tags.candidate = version;
				return "";
			},
		});
		expect(mutations).toEqual(["publish", "dist-tag", "publish"]);
	});

	it("publishes descriptor-captured bytes without reopening a same-UID-replaced pathname", async () => {
		const candidate = createCandidateFixture();
		const plan = {
			releaseId: candidate.releaseId,
			version,
			registry,
			candidateDistTag: "candidate",
			promotionDistTag: "latest",
		};
		const live = new Map(
			candidate.manifest.packages.map((item) => [
				item.name,
				{
					integrity: undefined as string | undefined,
					tags: {} as Record<string, string>,
				},
			]),
		);
		const view = (spec: string, field: string) => {
			const item = candidate.manifest.packages.find(
				(entry) => spec === entry.name || spec === `${entry.name}@${version}`,
			);
			if (!item) throw new Error(`unknown package ${spec}`);
			const state = live.get(item.name);
			return field === "dist-tags" ? state?.tags : state?.integrity;
		};
		let sourceSwapped = false;
		const publishedHashes: string[] = [];
		await publishCandidateCohort({
			manifest: candidate.manifest,
			manifestPath: candidate.manifestPath,
			plan,
			env: {},
			view,
			beforePublish: ({ sourcePath }: { sourcePath: string }) => {
				if (!sourceSwapped) {
					sourceSwapped = true;
					writeFileSync(sourcePath, "same-UID replacement after capture\n");
				}
			},
			publisher: ({
				item,
				tarballData,
			}: {
				item: (typeof candidate.manifest.packages)[number];
				tarballData: Buffer;
			}) => {
				const capturedHash = createHash("sha512")
					.update(tarballData)
					.digest("hex");
				publishedHashes.push(capturedHash);
				expect(capturedHash).toBe(item.sha512);
				const state = live.get(item.name);
				if (!state) throw new Error("missing live state");
				state.integrity = item.integrity;
				state.tags.candidate = version;
			},
		});
		expect(sourceSwapped).toBe(true);
		expect(publishedHashes).toHaveLength(packages.length);
	});

	it("rejects source substitution and hard links before descriptor capture", async () => {
		for (const attack of ["source", "source-hardlink"]) {
			const candidate = createCandidateFixture();
			const plan = {
				releaseId: candidate.releaseId,
				version,
				registry,
				candidateDistTag: "candidate",
				promotionDistTag: "latest",
			};
			const mutations: string[] = [];
			await expect(
				publishCandidateCohort({
					manifest: candidate.manifest,
					manifestPath: candidate.manifestPath,
					plan,
					env: {},
					view: (_spec: string, field: string) =>
						field === "dist-tags" ? {} : undefined,
					beforeSnapshot: () => {
						if (attack === "source")
							writeFileSync(join(candidate.directory, "0.tgz"), "foreign\n");
						else
							linkSync(
								join(candidate.directory, "0.tgz"),
								join(candidate.directory, "snapshot-peer.tgz"),
							);
					},
					publisher: () => {
						mutations.push("publish");
					},
				}),
			).rejects.toThrow(
				attack === "source"
					? /changed before in-memory publication capture/i
					: /exactly one hard link/i,
			);
			expect(mutations).toEqual([]);
		}
	});

	it("resumes an interrupted in-memory publish and rejects a replayed journal", async () => {
		const candidate = createCandidateFixture();
		const plan = {
			releaseId: candidate.releaseId,
			version,
			registry,
			candidateDistTag: "candidate",
			promotionDistTag: "latest",
		};
		let interrupted = false;
		await expect(
			publishCandidateCohort({
				manifest: candidate.manifest,
				manifestPath: candidate.manifestPath,
				plan,
				env: {},
				view: (_spec: string, field: string) =>
					field === "dist-tags" ? {} : undefined,
				publisher: () => {
					if (!interrupted) {
						interrupted = true;
						throw new Error("publish interruption");
					}
				},
			}),
		).rejects.toThrow(/publish interruption/i);
		const live = new Map(
			candidate.manifest.packages.map((item) => [
				item.name,
				{
					integrity: undefined as string | undefined,
					tags: {} as Record<string, string>,
				},
			]),
		);
		const view = (spec: string, field: string) => {
			const item = candidate.manifest.packages.find(
				(entry) => spec === entry.name || spec === `${entry.name}@${version}`,
			);
			const state = item ? live.get(item.name) : undefined;
			return field === "dist-tags" ? state?.tags : state?.integrity;
		};
		await publishCandidateCohort({
			manifest: candidate.manifest,
			manifestPath: candidate.manifestPath,
			plan,
			env: {},
			view,
			publisher: ({
				item,
			}: {
				item: (typeof candidate.manifest.packages)[number];
			}) => {
				const state = live.get(item.name);
				if (!state) throw new Error("missing live state");
				state.integrity = item.integrity;
				state.tags.candidate = version;
			},
		});
		const completedPackage = live.get(candidate.manifest.packages[0].name);
		if (!completedPackage) throw new Error("missing completed package state");
		completedPackage.tags = {};
		const replayMutations: string[] = [];
		await expect(
			publishCandidateCohort({
				manifest: candidate.manifest,
				manifestPath: candidate.manifestPath,
				plan,
				env: {},
				view,
				command: () => {
					replayMutations.push("tag");
					return "";
				},
			}),
		).rejects.toThrow(/completed candidate publication has drifted/i);
		expect(replayMutations).toEqual([]);

		const replay = createCandidateFixture();
		replay.manifest.releaseId = "different-release";
		writeJson(replay.manifestPath, replay.manifest);
		writeTestFile(
			`${replay.manifestPath}.candidate-publish.json`,
			readFileSync(`${candidate.manifestPath}.candidate-publish.json`),
			0o600,
		);
		chmodSync(`${replay.manifestPath}.candidate-publish.json`, 0o600);
		await expect(
			publishCandidateCohort({
				manifest: replay.manifest,
				manifestPath: replay.manifestPath,
				plan: { ...plan, releaseId: "different-release" },
				env: {},
				view: (spec: string, field: string) => {
					const item = replay.manifest.packages.find(
						(entry) =>
							spec === entry.name || spec === `${entry.name}@${version}`,
					);
					return field === "dist-tags"
						? { candidate: version }
						: item?.integrity;
				},
			}),
		).rejects.toThrow(/journal belongs to different release bytes/i);
	});

	it("treats only explicit registry absence codes as missing", () => {
		const plan = { registry };
		const missing = Object.assign(new Error("pnpm view failed"), {
			stderr:
				"ERR_PNPM_FETCH_404 GET https://registry.invalid/pkg: Not Found - 404",
		});
		expect(
			pnpmView("@jbcom/missing", "dist.integrity", plan, {}, () => {
				throw missing;
			}),
		).toBeUndefined();
		const missingVersion = Object.assign(new Error("pnpm view failed"), {
			stdout: JSON.stringify({
				error: {
					code: "ERR_PNPM_PACKAGE_NOT_FOUND",
					message: "No matching version found for @jbcom/example@fixture",
				},
			}),
		});
		expect(
			pnpmView("@jbcom/example@fixture", "dist.integrity", plan, {}, () => {
				throw missingVersion;
			}),
		).toBeUndefined();
		const unavailable = Object.assign(new Error("pnpm view failed"), {
			stderr: "ETIMEDOUT registry unavailable",
		});
		expect(() =>
			pnpmView("@jbcom/missing", "dist.integrity", plan, {}, () => {
				throw unavailable;
			}),
		).toThrow(/registry read failed/i);
		expect(() =>
			pnpmView("@jbcom/missing", "dist.integrity", plan, {}, () => ""),
		).toThrow(/registry read failed/i);
	});

	it("packs one immutable external cohort manifest with source, tree, lock, and tarball SHA-512", () => {
		const fixture = createFixture();
		const plan = loadSoloReleasePlan(fixture.planPath);
		applyFixtureRelease(fixture, plan);
		const source = commitAppliedFixture(fixture);
		for (const record of packages) {
			mkdirSync(join(fixture.root, record.directory, "dist"));
			writeTestFile(
				join(fixture.root, record.directory, "dist/stale.js"),
				"must be removed\n",
			);
		}
		const built: string[] = [];
		const build = (command: string, args: string[]) => {
			expect(command).toBe("pnpm");
			const name = args[1];
			const record = packages.find((item) => item.name === name);
			expect(record).toBeDefined();
			const dist = join(fixture.root, record?.directory ?? "", "dist");
			expect(existsSync(join(dist, "stale.js"))).toBe(false);
			mkdirSync(dist, { recursive: true });
			writeTestFile(join(dist, "index.js"), "export const built = true;\n");
			writeTestFile(
				join(dist, "index.d.ts"),
				"export declare const built: true;\n",
			);
			built.push(name);
			return "";
		};
		const artifacts = join(tmpdir(), `solo-release-artifacts-${randomUUID()}`);
		temporaryDirectories.push(artifacts);
		const result = createProvenanceManifest({
			root: fixture.root,
			plan,
			artifactsDirectory: artifacts,
			source,
			command: build,
			signer: testProvenanceSigner,
		});
		expect(result.manifest.schemaVersion).toBe(3);
		expect(built).toEqual(packages.map(({ name }) => name));
		expect(result.manifest.source).toMatchObject({
			commit: source.head,
			tree: source.tree,
			upstreamCommit: plan.upstreamCommit,
		});
		expect(result.manifest.lockfile.sha512).toBe(
			sha512File(join(fixture.root, "pnpm-lock.yaml")),
		);
		expect(result.manifest.packages).toHaveLength(4);
		for (const item of result.manifest.packages) {
			const archive = join(artifacts, item.archive);
			expect(item.sha512).toBe(sha512File(archive));
			expect(item.integrity).toMatch(/^sha512-/);
			expect(item.exports).toMatchObject({
				".": {
					types: "./dist/index.d.ts",
					import: "./dist/index.js",
				},
			});
			expect(item.publishManifest).toMatchObject({
				name: item.name,
				version,
				exports: item.exports,
			});
		}
		expect(existsSync(result.sidecarPath)).toBe(true);
		expect(existsSync(result.statement)).toBe(true);
		expect(existsSync(result.signature)).toBe(true);
		expect(() =>
			loadProvenance(result.manifestPath, plan, fixture.root),
		).not.toThrow();
		const writeSignedManifest = (manifest: typeof result.manifest) => {
			writeJson(result.manifestPath, manifest);
			writeTestFile(
				result.sidecarPath,
				`${sha512File(result.manifestPath)}  ${result.manifestPath.split("/").at(-1)}\n`,
				0o644,
			);
			const statement = JSON.parse(readFileSync(result.statement, "utf8"));
			statement.subject.manifestSha512 = sha512File(result.manifestPath);
			writeJson(result.statement, statement);
			writeTestFile(
				result.signature,
				`${testProvenanceSigner(readFileSync(result.statement)).toString("base64")}\n`,
				0o644,
			);
		};
		const manifestMetadataForgery = structuredClone(result.manifest);
		manifestMetadataForgery.packages[0].publishManifest.description =
			"forged after archive capture";
		writeSignedManifest(manifestMetadataForgery);
		expect(() =>
			loadProvenance(result.manifestPath, plan, fixture.root),
		).toThrow(/archive metadata differs from signed provenance/i);
		writeSignedManifest(result.manifest);
		const externalDirectory = mkdtempSync(
			join(tmpdir(), "solo-foreign-archive-"),
		);
		temporaryDirectories.push(externalDirectory);
		const externalArchive = join(externalDirectory, "foreign.tgz");
		writeTestFile(externalArchive, "foreign archive\n");
		writeJson(result.manifestPath, {
			...result.manifest,
			packages: result.manifest.packages.map((item, index) => ({
				...item,
				...(index === 0 ? { archive: externalArchive } : {}),
			})),
		});
		writeTestFile(
			result.sidecarPath,
			`${sha512File(result.manifestPath)}  ${result.manifestPath.split("/").at(-1)}\n`,
			0o644,
		);
		const forgedStatement = JSON.parse(readFileSync(result.statement, "utf8"));
		forgedStatement.subject.manifestSha512 = sha512File(result.manifestPath);
		writeJson(result.statement, forgedStatement);
		writeTestFile(
			result.signature,
			`${testReviewSigner(readFileSync(result.statement)).toString("base64")}\n`,
			0o644,
		);
		const accesses: string[] = [];
		let inspections = 0;
		expect(() =>
			loadProvenance(result.manifestPath, plan, fixture.root, {
				onArtifactAccess: ({ kind }) => accesses.push(kind),
				inspectArchive: () => {
					inspections += 1;
					throw new Error("archive inspection must not run");
				},
			}),
		).toThrow(/signature is invalid/i);
		expect(accesses).toEqual([]);
		expect(inspections).toBe(0);
		expect(
			existsSync(join(fixture.root, `${plan.releaseId}.provenance.json`)),
		).toBe(false);
	});

	it("preflights the artifact output before deleting any build output", () => {
		const fixture = createFixture();
		const plan = loadSoloReleasePlan(fixture.planPath);
		applyFixtureRelease(fixture, plan);
		const stale = join(fixture.root, packages[0].directory, "dist/stale.js");
		mkdirSync(join(stale, ".."), { recursive: true });
		writeFileSync(stale, "preserve on refusal\n");
		const artifacts = join(tmpdir(), `solo-release-artifacts-${randomUUID()}`);
		temporaryDirectories.push(artifacts);
		mkdirSync(artifacts);
		writeTestFile(join(artifacts, "foreign"), "occupied\n");
		expect(() =>
			createProvenanceManifest({
				root: fixture.root,
				plan,
				artifactsDirectory: artifacts,
				source: { head: "a".repeat(40), tree: "b".repeat(40) },
				command: () => {
					throw new Error("build must not start");
				},
				signer: testProvenanceSigner,
			}),
		).toThrow(/new and empty/i);
		expect(readFileSync(stale, "utf8")).toBe("preserve on refusal\n");
	});

	it("pins an aliased artifact parent before later alias replacement", () => {
		const fixture = createFixture();
		const plan = loadSoloReleasePlan(fixture.planPath);
		applyFixtureRelease(fixture, plan);
		const source = commitAppliedFixture(fixture);
		const parent = mkdtempSync(join(tmpdir(), "solo-release-real-parent-"));
		const redirect = mkdtempSync(
			join(tmpdir(), "solo-release-redirect-parent-"),
		);
		const alias = join(tmpdir(), `solo-release-parent-alias-${randomUUID()}`);
		temporaryDirectories.push(alias, parent, redirect);
		symlinkSync(parent, alias);
		const artifacts = join(alias, "artifacts");
		let redirected = false;
		const result = createProvenanceManifest({
			root: fixture.root,
			plan,
			artifactsDirectory: artifacts,
			source,
			command: (_command: string, args: string[]) => {
				if (!redirected) {
					rmSync(alias);
					symlinkSync(redirect, alias);
					mkdirSync(join(redirect, "artifacts"), { mode: 0o700 });
					redirected = true;
				}
				const record = packages.find(({ name }) => name === args[1]);
				const dist = join(fixture.root, record?.directory ?? "", "dist");
				mkdirSync(dist, { recursive: true });
				writeTestFile(join(dist, "index.js"), "export const built = true;\n");
				writeTestFile(
					join(dist, "index.d.ts"),
					"export declare const built: true;\n",
				);
				return "";
			},
			signer: testProvenanceSigner,
		});
		expect(
			result.manifestPath.startsWith(join(realpathSync(parent), "artifacts")),
		).toBe(true);
		expect(readdirSync(join(redirect, "artifacts"))).toEqual([]);
	});

	it("preserves mode-0600 independent review evidence through provenance create and load", () => {
		const fixture = createFixture();
		const plan = loadSoloReleasePlan(fixture.planPath);
		applyFixtureRelease(fixture, plan);
		const source = commitAppliedFixture(fixture);
		const head = source.head;
		const receiptDirectory = mkdtempSync(
			join(tmpdir(), "solo-review-provenance-"),
		);
		temporaryDirectories.push(receiptDirectory);
		const receiptPath = join(receiptDirectory, "receipt.json");
		const assignment = fixture.assignment;
		writeJson(receiptPath, {
			schemaVersion: 1,
			algorithm: "ed25519",
			keyId: testReviewKeyId,
			verdict: "ACCEPT",
			releaseId: plan.releaseId,
			version: plan.version,
			enginePullRequest: plan.reviewEvidence.enginePullRequest.number,
			engineMergeCommit: plan.requiredSourceCommit,
			releasePullRequest: plan.reviewEvidence.releasePullRequest.number,
			releaseMergeCommit: head,
			planSha512: plan.planSha512,
			producerTaskId: assignment.producerTaskId,
			producerPrincipalId: assignment.producerPrincipalId,
			reviewerTaskId: assignment.reviewerTaskId,
			reviewerPrincipalId: assignment.reviewerPrincipalId,
			reviewerRole: assignment.reviewerRole,
			reviewerForkId: assignment.reviewerForkId,
			assignmentSha512: sha512File(fixture.assignmentPath),
			trustRootKeyId: testOrchestratorKeyId,
		});
		writeTestFile(
			`${receiptPath}.sig`,
			`${testReviewSigner(readFileSync(receiptPath)).toString("base64")}\n`,
			0o600,
		);
		chmodSync(receiptPath, 0o600);
		chmodSync(`${receiptPath}.sig`, 0o600);
		process.env.RPGJS_SOLO_REVIEW_RECEIPT_PATH = receiptPath;
		const independentReceipt = verifyIndependentReviewReceipt(plan, head);
		const artifacts = join(
			tmpdir(),
			`solo-release-review-artifacts-${randomUUID()}`,
		);
		temporaryDirectories.push(artifacts);
		const result = createProvenanceManifest({
			root: fixture.root,
			plan,
			artifactsDirectory: artifacts,
			source: {
				...source,
				reviewEvidence: { independentReceipt },
			},
			command: (_command: string, args: string[]) => {
				const record = packages.find(({ name }) => name === args[1]);
				const dist = join(fixture.root, record?.directory ?? "", "dist");
				mkdirSync(dist, { recursive: true });
				writeTestFile(join(dist, "index.js"), "export const built = true;\n");
				writeTestFile(
					join(dist, "index.d.ts"),
					"export declare const built: true;\n",
				);
				return "";
			},
			signer: testProvenanceSigner,
		});
		const copiedReceipt = join(
			artifacts,
			result.manifest.reviewReceipt.statement,
		);
		const copiedSignature = join(
			artifacts,
			result.manifest.reviewReceipt.signature,
		);
		expect(statSync(copiedReceipt).mode & 0o777).toBe(0o600);
		expect(statSync(copiedSignature).mode & 0o777).toBe(0o600);
		expect(() =>
			loadProvenance(result.manifestPath, plan, fixture.root),
		).not.toThrow();
	});

	it("refuses provenance when a build mutates reviewed tracked source", () => {
		const fixture = createFixture();
		const plan = loadSoloReleasePlan(fixture.planPath);
		applyFixtureRelease(fixture, plan);
		const source = commitAppliedFixture(fixture);
		expect(assertExactSourceWorktree(fixture.root, source)).toEqual(source);
		const artifacts = join(
			tmpdir(),
			`solo-release-mutating-build-${randomUUID()}`,
		);
		temporaryDirectories.push(artifacts);
		expect(() =>
			createProvenanceManifest({
				root: fixture.root,
				plan,
				artifactsDirectory: artifacts,
				source,
				command: (_command: string, args: string[]) => {
					const record = packages.find(({ name }) => name === args[1]);
					const dist = join(fixture.root, record?.directory ?? "", "dist");
					mkdirSync(dist, { recursive: true });
					writeTestFile(join(dist, "index.js"), "export {};\n");
					writeTestFile(join(dist, "index.d.ts"), "export {};\n");
					writeTestFile(
						join(fixture.root, record?.directory ?? "", "package.json"),
						"{}\n",
						0o644,
					);
					return "";
				},
				signer: testProvenanceSigner,
			}),
		).toThrow(/reviewed source worktree changed/i);
		expect(statSync(artifacts).mode & 0o777).toBe(0o700);
		expect(readdirSync(artifacts)).toEqual([]);
	});

	it("rejects an archive missing any conditional export target", () => {
		const fixture = createFixture();
		const plan = loadSoloReleasePlan(fixture.planPath);
		applyFixtureRelease(fixture, plan);
		const source = commitAppliedFixture(fixture);
		const artifacts = join(tmpdir(), `solo-release-artifacts-${randomUUID()}`);
		temporaryDirectories.push(artifacts);
		expect(() =>
			createProvenanceManifest({
				root: fixture.root,
				plan,
				artifactsDirectory: artifacts,
				source,
				command: (_command: string, args: string[]) => {
					const record = packages.find(({ name }) => name === args[1]);
					const dist = join(fixture.root, record?.directory ?? "", "dist");
					mkdirSync(dist, { recursive: true });
					writeTestFile(join(dist, "index.js"), "export {};\n");
					return "";
				},
				signer: testProvenanceSigner,
			}),
		).toThrow(/missing export target .*index\.d\.ts/i);
	});

	it("requires live registry latest state instead of trusting a journal", () => {
		const manifest = {
			packages: packages.map(({ name }) => ({
				name,
				integrity: `sha512-${name}`,
			})),
		};
		let stale = false;
		const view = (spec: string, field: string) => {
			if (field === "dist.integrity")
				return manifest.packages.find(({ name }) => spec.startsWith(`${name}@`))
					?.integrity;
			return {
				candidate: version,
				latest: stale && spec === packages[0].name ? previousVersion : version,
			};
		};
		const plan = {
			version,
			candidateDistTag: "candidate",
			promotionDistTag: "latest",
		};
		expect(() =>
			assertLivePromotedCohort(manifest, plan, {}, view),
		).not.toThrow();
		stale = true;
		expect(() => assertLivePromotedCohort(manifest, plan, {}, view)).toThrow(
			/live latest/i,
		);
	});

	it("stages, verifies, publishes, and reuses an immutable source release", async () => {
		const expected = createExpectedRelease();
		const adapter = createReleaseAdapter("fixture", expected);
		await expect(
			reconcileReleaseWithAdapter(expected, adapter),
		).resolves.toEqual({
			tag: expected.tag,
			assets: expected.assets.map(({ name }) => name),
		});
		expect(adapter.calls).toMatchObject({
			create: 1,
			upload: expected.assets.length,
			download: expected.assets.length * 2,
			publish: 1,
		});
		expect(adapter.calls.order.at(0)).toBe("create-draft");
		expect(adapter.calls.order.indexOf("publish")).toBeGreaterThan(
			adapter.calls.order.lastIndexOf(
				`download:draft:${expected.assets.at(-1)?.name}`,
			),
		);
		await reconcileReleaseWithAdapter(expected, adapter);
		expect(adapter.calls.create).toBe(1);
		expect(adapter.calls.upload).toBe(expected.assets.length);
		expect(adapter.calls.publish).toBe(1);
		expect(adapter.calls.download).toBe(expected.assets.length * 3);
	});

	it("resumes a partially uploaded draft without replacing verified assets", async () => {
		const expected = createExpectedRelease();
		const adapter = createReleaseAdapter("fixture", expected, {
			failUploadAt: 2,
		});
		await expect(
			reconcileReleaseWithAdapter(expected, adapter),
		).rejects.toThrow(/upload interrupted/i);
		await expect(
			reconcileReleaseWithAdapter(expected, adapter),
		).resolves.toMatchObject({ tag: expected.tag });
		expect(adapter.calls.create).toBe(1);
		expect(
			adapter.calls.order.filter(
				(entry) => entry === `upload:${expected.assets[0].name}`,
			),
		).toHaveLength(1);
		expect(adapter.calls.publish).toBe(1);
	});

	it("accepts a publish response crash only after verifying the immutable release", async () => {
		const expected = createExpectedRelease();
		const adapter = createReleaseAdapter("fixture", expected, {
			failPublishAfterOnce: true,
		});
		await expect(
			reconcileReleaseWithAdapter(expected, adapter),
		).rejects.toThrow(/publish response was interrupted/i);
		await expect(
			reconcileReleaseWithAdapter(expected, adapter),
		).resolves.toMatchObject({ tag: expected.tag });
		expect(adapter.calls.create).toBe(1);
		expect(adapter.calls.publish).toBe(1);
		expect(adapter.calls.upload).toBe(expected.assets.length);
	});

	it("drives GitHub through draft, asset verification, and final publication", async () => {
		const expected = createExpectedRelease();
		const bytes = new Map<string, Buffer>();
		let release:
			| {
					tagName: string;
					targetCommitish: string;
					name: string;
					body: string;
					isDraft: boolean;
					isPrerelease: boolean;
			  }
			| undefined;
		const mutations: string[][] = [];
		const command = (program: string, args: string[]) => {
			expect(program).toBe("gh");
			if (args[1] === "view") {
				if (!release) throw new Error("release not found");
				return JSON.stringify({
					...release,
					assets: [...bytes.keys()].map((name) => ({ name })),
				});
			}
			if (args[1] === "create") {
				mutations.push(args);
				expect(args).toContain("--draft");
				release = {
					tagName: expected.tag,
					targetCommitish: expected.target,
					name: expected.title,
					body: expected.body,
					isDraft: true,
					isPrerelease: true,
				};
				return "";
			}
			if (args[1] === "upload") {
				mutations.push(args);
				expect(release?.isDraft).toBe(true);
				const path = args[3];
				const name = path.split("/").at(-1) ?? "";
				bytes.set(name, readFileSync(path));
				return "";
			}
			if (args[1] === "download") {
				const name = args[args.indexOf("--pattern") + 1];
				const destination = args[args.indexOf("--output") + 1];
				writeTestFile(destination, bytes.get(name) ?? Buffer.alloc(0));
				return "";
			}
			if (args[1] === "edit") {
				mutations.push(args);
				expect(args).toContain("--draft=false");
				expect(bytes.size).toBe(expected.assets.length);
				if (!release) throw new Error("release missing");
				release.isDraft = false;
				return "";
			}
			throw new Error(`unexpected gh call ${args.join(" ")}`);
		};
		const adapter = createGitHubReleaseAdapter(
			{
				canonical: { repository: "https://github.com/jbcom/rpgjs-solo.git" },
				trainTag: expected.tag,
			},
			command,
		);
		await expect(
			reconcileReleaseWithAdapter(expected, adapter),
		).resolves.toMatchObject({ tag: expected.tag });
		expect(mutations.map((args) => args[1])).toEqual([
			"create",
			"upload",
			"upload",
			"edit",
		]);
	});

	it("restates immutable Gitea metadata when publishing a draft", () => {
		const expected = createExpectedRelease();
		let invocation: string[] = [];
		const adapter = createGiteaReleaseAdapter(
			{
				backup: {
					apiRepository: "jbcom/rpgjs-solo",
					repository: "https://git.example.test/jbcom/rpgjs-solo.git",
				},
				trainTag: expected.tag,
			},
			(program: string, args: string[]) => {
				expect(program).toBe("tea");
				invocation = args;
				return "";
			},
		);
		adapter.publishRelease({}, expected);
		expect(invocation).toEqual([
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
			"jbcom/rpgjs-solo",
		]);
	});

	it("resumes Gitea after GitHub succeeds without recreating either release", async () => {
		const expected = createExpectedRelease();
		const github = createReleaseAdapter("github", expected, { existing: true });
		const gitea = createReleaseAdapter("gitea", expected, {
			failCreateOnce: true,
		});
		await expect(
			reconcileReleaseRemotes({ expected, remotes: [github, gitea] }),
		).rejects.toThrow(/temporarily unavailable/);
		expect(github.calls.create).toBe(0);
		await expect(
			reconcileReleaseRemotes({ expected, remotes: [github, gitea] }),
		).resolves.toMatchObject({
			github: { tag: expected.tag },
			gitea: { tag: expected.tag },
		});
		expect(github.calls.create).toBe(0);
		expect(gitea.calls.create).toBe(2);
	});

	it("preflights release-note bytes before overwriting output", () => {
		const fixture = createFixture();
		const plan = loadSoloReleasePlan(fixture.planPath);
		const directory = mkdtempSync(join(tmpdir(), "solo-release-proof-"));
		temporaryDirectories.push(directory);
		const manifestPath = join(directory, "manifest.json");
		const sidecarPath = `${manifestPath}.sha512`;
		const archivePath = join(directory, "archive.tgz");
		writeFileSync(manifestPath, "{}\n");
		writeFileSync(sidecarPath, "sidecar\n");
		writeFileSync(`${manifestPath}.attestation.json`, "{}\n");
		writeFileSync(`${manifestPath}.attestation.sig`, "signature\n");
		writeFileSync(archivePath, "archive\n");
		const manifest = {
			source: {
				commit: "a".repeat(40),
				tree: "b".repeat(40),
				upstreamCommit: "c".repeat(40),
			},
			packages: [{ archive: "archive.tgz" }],
		};
		const notes = join(directory, `${plan.releaseId}.release-notes.md`);
		writeFileSync(notes, "foreign\n");
		expect(() => prepareReleaseEvidence(manifest, manifestPath, plan)).toThrow(
			/foreign bytes/i,
		);
		expect(readFileSync(notes, "utf8")).toBe("foreign\n");
	});

	it("uses mode-0600 ephemeral authentication and removes it even after failure", async () => {
		let npmrc = "";
		const previous = process.env.RPGJS_SOLO_NPM_TOKEN;
		process.env.RPGJS_SOLO_NPM_TOKEN = "outer-secret";
		try {
			await expect(
				withEphemeralNpmAuth("do-not-persist", registry, async (env) => {
					npmrc = env.npm_config_userconfig ?? "";
					expect(npmrc).not.toBe("");
					expect(env.RPGJS_SOLO_NPM_TOKEN).toBeUndefined();
					const npmrcState = inspectTestFile(npmrc);
					expect(npmrcState.mode).toBe(0o600);
					expect(npmrcState.text).toContain("do-not-persist");
					throw new Error("stop");
				}),
			).rejects.toThrow("stop");
		} finally {
			if (previous === undefined) delete process.env.RPGJS_SOLO_NPM_TOKEN;
			else process.env.RPGJS_SOLO_NPM_TOKEN = previous;
		}
		expect(existsSync(npmrc)).toBe(false);
	});
});
