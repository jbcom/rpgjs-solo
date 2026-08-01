import {
	createHash,
	generateKeyPairSync,
	randomUUID,
	sign as signBytes,
} from "node:crypto";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	applySoloReleaseTransaction,
	assertCanonicalMain,
	assertLivePromotedCohort,
	assertMonotonicLatestPromotion,
	assertPullRequestReviewEvidence,
	assertReleaseToolchain,
	assertReviewedCanonicalMain,
	createGiteaReleaseAdapter,
	createGitHubReleaseAdapter,
	createProvenanceManifest,
	loadProvenance,
	loadSoloReleasePlan,
	nextPromotionAction,
	pnpmView,
	prepareReleaseEvidence,
	publishCandidateCohort,
	reconcileReleaseRemotes,
	reconcileReleaseWithAdapter,
	sha512File,
	validateSoloReleaseState,
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
		tag: `solo-v${version}`,
	},
	{
		name: "@jbcom/rpgjs-solo-action-battle",
		directory: "packages/solo-action-battle",
		tag: `action-v${version}`,
	},
	{
		name: "@jbcom/rpgjs-solo-renderer",
		directory: "packages/solo-renderer",
		tag: `renderer-v${version}`,
	},
	{
		name: "@jbcom/rpgjs-solo-vite",
		directory: "packages/solo-vite",
		tag: `vite-v${version}`,
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
const testAttestationKeys = generateKeyPairSync("ed25519");
const testPublicKeyPem = testAttestationKeys.publicKey.export({
	type: "spki",
	format: "pem",
}).toString();
const testAttestationKeyId = createHash("sha256")
	.update(
		testAttestationKeys.publicKey.export({ type: "spki", format: "der" }),
	)
	.digest("hex");
const testProvenanceSigner = (value: Buffer) =>
	signBytes(null, value, testAttestationKeys.privateKey);
const writeJson = (path: string, value: unknown) =>
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0))
		rmSync(directory, { recursive: true, force: true });
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
				keyId: testAttestationKeyId,
				publicKeyPem: testPublicKeyPem,
				producerPrincipalId: "producer-fixture",
			},
		},
		provenanceAttestation: {
			status: "final",
			algorithm: "ed25519",
			keyId: testAttestationKeyId,
			publicKeyPem: testPublicKeyPem,
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
	return { root, planPath, carriedSources };
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
			writeFileSync(destination, bytes.get(asset.name) ?? Buffer.alloc(0));
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
	it("fails closed unless the executing toolchain is exact Node 24 and pnpm 11.18.0", () => {
		expect(
			assertReleaseToolchain(() => "11.18.0", "24.18.1"),
		).toEqual({ nodeVersion: "24.18.1", pnpmVersion: "11.18.0" });
		expect(() => assertReleaseToolchain(() => "11.18.0", "26.5.0")).toThrow(
			/requires Node 24/i,
		);
		expect(() => assertReleaseToolchain(() => "11.17.0", "24.18.1")).toThrow(
			/requires pnpm 11\.18\.0/i,
		);
	});

	it("pins one beta.29 Solo increment and the post-review source requirement", () => {
		const plan = loadSoloReleasePlan();
		expect(plan.previousVersion).toBe(previousVersion);
		expect(plan.version).toBe(version);
		expect(plan.requiredSourceCommit).toBe(
			"f0144127fe43c264638ca2699b8bfcd3cd55fea6",
		);
		expect(
			plan.carriedChangesets.find(
				({ id }: { id: string }) => id === "fair-studio-success-rates",
			)?.introducedBy,
		).toBe("f0144127fe43c264638ca2699b8bfcd3cd55fea6");
		expect(plan.inheritedReleaseDirectories).toEqual(
			inheritedReleaseDirectories,
		);
		expect(plan.sourceBinding.status).toBe("provisional");
		expect(plan.reviewEvidence.status).toBe("provisional");
		expect(plan.provenanceAttestation.status).toBe("provisional");
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

		for (let failureIndex = 0; failureIndex < boundaries.length; failureIndex++) {
			const fixture = createFixture();
			const plan = loadSoloReleasePlan(fixture.planPath);
			initializeFixtureGit(fixture, plan);
			let seen = 0;
			expect(() =>
				applySoloReleaseTransaction(fixture.root, plan, undefined, {
					targetLockfileFactory: () => "deterministic-lock\n",
					afterBoundary: () => {
						if (seen++ === failureIndex) throw new Error("injected interruption");
					},
				}),
			).toThrow(/injected interruption/);
			expect(
				applySoloReleaseTransaction(fixture.root, plan, undefined, {
					targetLockfileFactory: () => "deterministic-lock\n",
				}),
			).toMatchObject({ phase: "applied", lockfileRefreshed: true });
			expect(validateSoloReleaseState(fixture.root, plan).phase).toBe("applied");
			expect(existsSync(join(fixture.root, ".rpgjs-solo-release-apply.json"))).toBe(
				false,
			);
		}
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
		const writeReceipt = (reviewerPrincipalId: string) => {
			writeJson(receiptPath, {
				schemaVersion: 1,
				algorithm: "ed25519",
				keyId: testAttestationKeyId,
				verdict: "ACCEPT",
				releaseId: plan.releaseId,
				version: plan.version,
				enginePullRequest: plan.reviewEvidence.enginePullRequest.number,
				engineMergeCommit: plan.requiredSourceCommit,
				releasePullRequest: plan.reviewEvidence.releasePullRequest.number,
				releaseMergeCommit: head,
				planSha512: sha512File(plan.planPath),
				producerPrincipalId:
					plan.reviewEvidence.independentReceipt.producerPrincipalId,
				reviewerPrincipalId,
			});
			writeFileSync(
				`${receiptPath}.sig`,
				`${testProvenanceSigner(readFileSync(receiptPath)).toString("base64")}\n`,
			);
		};
		try {
			process.env.RPGJS_SOLO_REVIEW_RECEIPT_PATH = receiptPath;
			writeReceipt("reviewer-fixture");
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
						statusCheckRollup: [
							{ name: "tests (24)", conclusion: "SUCCESS" },
						],
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
				throw new Error(`Unexpected review command ${program} ${args.join(" ")}`);
			};
			expect(
				assertReviewedCanonicalMain(
					plan,
					head,
					noSelfApproval,
					fixture.root,
				),
			).toMatchObject({
				engine: { githubApproved: false },
				release: { githubApproved: false },
				independentReceipt: { reviewerPrincipalId: "reviewer-fixture" },
			});
			writeReceipt("producer-fixture");
			expect(() => verifyIndependentReviewReceipt(plan, head)).toThrow(
				/producer-disjoint release/i,
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

	it("preflights the complete candidate cohort before any registry mutation", () => {
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
		expect(() =>
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
		).toThrow(/foreign bytes/i);
		expect(mutations).toEqual([]);
	});

	it("executes only the immutable candidate actions selected by preflight", () => {
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
		publishCandidateCohort({
			manifest,
			manifestPath: "/tmp/fixture/provenance.json",
			plan,
			env: {},
			view,
			command: (_command: string, args: string[]) => {
				mutations.push(args[0]);
				if (args[0] === "publish") {
					const index = Number(args[1].split("/").at(-1)?.replace(".tgz", ""));
					const item = manifest.packages[index];
					const state = live.get(item.name);
					if (!state) throw new Error("missing live state");
					state.integrity = item.integrity;
					state.tags.candidate = version;
				} else {
					const item = manifest.packages.find(
						(candidate) => args[2] === `${candidate.name}@${version}`,
					);
					if (!item) throw new Error("missing dist-tag target");
					const state = live.get(item.name);
					if (!state) throw new Error("missing live state");
					state.tags.candidate = version;
				}
				return "";
			},
		});
		expect(mutations).toEqual(["publish", "dist-tag", "publish"]);
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
		for (const record of packages) {
			mkdirSync(join(fixture.root, record.directory, "dist"));
			writeFileSync(
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
			writeFileSync(join(dist, "index.js"), "export const built = true;\n");
			writeFileSync(
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
			source: { head: "a".repeat(40), tree: "b".repeat(40) },
			command: build,
			signer: testProvenanceSigner,
		});
		expect(built).toEqual(packages.map(({ name }) => name));
		expect(result.manifest.source).toMatchObject({
			commit: "a".repeat(40),
			tree: "b".repeat(40),
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
		}
		expect(existsSync(result.sidecarPath)).toBe(true);
		expect(existsSync(result.statement)).toBe(true);
		expect(existsSync(result.signature)).toBe(true);
		expect(() => loadProvenance(result.manifestPath, plan, fixture.root)).not.toThrow();
		writeJson(result.manifestPath, { ...result.manifest, coherentTamper: true });
		writeFileSync(
			result.sidecarPath,
			`${sha512File(result.manifestPath)}  ${result.manifestPath.split("/").at(-1)}\n`,
		);
		expect(() => loadProvenance(result.manifestPath, plan, fixture.root)).toThrow(
			/attestation statement drifted|signature is invalid/i,
		);
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
		writeFileSync(join(artifacts, "foreign"), "occupied\n");
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

	it("rejects an archive missing any conditional export target", () => {
		const fixture = createFixture();
		const plan = loadSoloReleasePlan(fixture.planPath);
		applyFixtureRelease(fixture, plan);
		const artifacts = join(tmpdir(), `solo-release-artifacts-${randomUUID()}`);
		temporaryDirectories.push(artifacts);
		expect(() =>
			createProvenanceManifest({
				root: fixture.root,
				plan,
				artifactsDirectory: artifacts,
				source: { head: "a".repeat(40), tree: "b".repeat(40) },
				command: (_command: string, args: string[]) => {
					const record = packages.find(({ name }) => name === args[1]);
					const dist = join(fixture.root, record?.directory ?? "", "dist");
					mkdirSync(dist, { recursive: true });
					writeFileSync(join(dist, "index.js"), "export {};\n");
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
				writeFileSync(destination, bytes.get(name) ?? Buffer.alloc(0));
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
					expect(statSync(npmrc).mode & 0o777).toBe(0o600);
					expect(readFileSync(npmrc, "utf8")).toContain("do-not-persist");
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
