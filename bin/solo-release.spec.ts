import { createHash, randomUUID } from "node:crypto";
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
	applySoloReleasePlan,
	applySoloReleaseTransaction,
	assertCanonicalMain,
	assertLivePromotedCohort,
	createProvenanceManifest,
	loadSoloReleasePlan,
	nextPromotionAction,
	prepareReleaseEvidence,
	reconcileReleaseRemotes,
	reconcileReleaseWithAdapter,
	sha512File,
	validateSoloReleaseState,
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
	const carriedChangesets = Object.entries(carriedSources).map(([id, source]) => ({
		id,
		sha256: sha256(source),
		...(id === "studio" ? { introducedBy: "4".repeat(40) } : {}),
	}));
	const plan = {
		schemaVersion: 1,
		releaseId: "fixture",
		sourceBaseCommit: "2".repeat(40),
		requiredSourceCommit: "2".repeat(40),
		sourceBinding: { status: "final" },
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
	options: { existing?: boolean; failCreateOnce?: boolean } = {},
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
	const calls = { create: 0, upload: 0, download: 0 };
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
		createRelease() {
			calls.create += 1;
			if (failCreate) {
				failCreate = false;
				throw new Error(`${name} temporarily unavailable`);
			}
			release = {
				tag: expected.tag,
				target: expected.target,
				title: expected.title,
				body: expected.body,
				draft: false,
				prerelease: true,
			};
		},
		uploadAsset(_release: unknown, asset: { name: string; path: string }) {
			calls.upload += 1;
			bytes.set(asset.name, readFileSync(asset.path));
		},
		downloadAsset(
			_release: unknown,
			asset: { name: string },
			destination: string,
		) {
			calls.download += 1;
			writeFileSync(destination, bytes.get(asset.name) ?? Buffer.alloc(0));
		},
	};
}

describe("Solo beta.29 coordinated release transaction", () => {
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
	});

	it("applies only the cohort once, preserves inherited changesets, and never creates beta.30", () => {
		const fixture = createFixture();
		const plan = loadSoloReleasePlan(fixture.planPath);
		expect(validateSoloReleaseState(fixture.root, plan).phase).toBe("source");
		expect(applySoloReleasePlan(fixture.root, plan)).toEqual({
			changed: true,
			phase: "applied",
		});
		expect(applySoloReleasePlan(fixture.root, plan)).toEqual({
			changed: false,
			phase: "applied",
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
		const manifestPath = join(fixture.root, packages[0].directory, "package.json");
		const before = readFileSync(manifestPath, "utf8");
		writeFileSync(
			join(fixture.root, packages.at(-1)?.directory ?? "", "CHANGELOG.md"),
			"foreign\n",
		);
		expect(() => applySoloReleasePlan(fixture.root, plan)).toThrow(
			/already has a changelog/i,
		);
		expect(readFileSync(manifestPath, "utf8")).toBe(before);
		expect(
			existsSync(join(fixture.root, ".changeset/solo.md")),
		).toBe(true);
	});

	it("always refreshes the lockfile when retrying an applied transition", () => {
		const fixture = createFixture();
		const plan = loadSoloReleasePlan(fixture.planPath);
		const headFiles = new Map<string, string>();
		for (const entry of plan.consumedChangesets) {
			const path = `.changeset/${entry.id}.md`;
			headFiles.set(path, readFileSync(join(fixture.root, path), "utf8"));
		}
		headFiles.set(
			"packages/solo/package.json",
			readFileSync(join(fixture.root, "packages/solo/package.json"), "utf8"),
		);
		let installs = 0;
		const fake = (command: string, args: string[]) => {
			if (command === "pnpm") {
				installs += 1;
				if (installs === 1) throw new Error("interrupted lockfile refresh");
				return "";
			}
			if (args[0] === "status") return "";
			if (args[0] === "diff") return "packages/solo/package.json";
			if (args[0] === "ls-files") return "packages/solo/CHANGELOG.md";
			if (args[0] === "show")
				return headFiles.get(args[1].replace(/^HEAD:/, "")) ?? "";
			if (args[0] === "rev-parse") return "a".repeat(40);
			if (args[0] === "merge-base") return "";
			return "";
		};
		expect(() =>
			applySoloReleaseTransaction(fixture.root, plan, fake),
		).toThrow(/interrupted lockfile refresh/);
		expect(validateSoloReleaseState(fixture.root, plan).phase).toBe("applied");
		expect(applySoloReleaseTransaction(fixture.root, plan, fake)).toEqual({
			changed: false,
			phase: "applied",
			lockfileRefreshed: true,
		});
		expect(installs).toBe(2);
	});

	it("rejects tampering inside an otherwise allowed apply-retry path", () => {
		const fixture = createFixture();
		const plan = loadSoloReleasePlan(fixture.planPath);
		const headChangesets = new Map(
			plan.consumedChangesets.map((entry: { id: string }) => {
				const path = `.changeset/${entry.id}.md`;
				return [path, readFileSync(join(fixture.root, path), "utf8")];
			}),
		);
		applySoloReleasePlan(fixture.root, plan);
		const changelogPath = "packages/solo/CHANGELOG.md";
		writeFileSync(join(fixture.root, changelogPath), "tampered\n");
		let installed = false;
		const fake = (command: string, args: string[]) => {
			if (command === "pnpm") {
				installed = true;
				return "";
			}
			if (args[0] === "diff") return "";
			if (args[0] === "ls-files") return changelogPath;
			if (args[0] === "show")
				return headChangesets.get(args[1].replace(/^HEAD:/, "")) ?? "";
			if (args[0] === "rev-parse") return "a".repeat(40);
			if (args[0] === "merge-base") return "";
			return "";
		};
		expect(() =>
			applySoloReleaseTransaction(fixture.root, plan, fake),
		).toThrow(/changelog differs/i);
		expect(installed).toBe(false);
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

	it("rejects hash drift before writing", () => {
		const fixture = createFixture();
		const plan = loadSoloReleasePlan(fixture.planPath);
		writeFileSync(
			join(fixture.root, ".changeset/runtime.md"),
			`${readFileSync(join(fixture.root, ".changeset/runtime.md"))}tamper`,
		);
		expect(() => applySoloReleasePlan(fixture.root, plan)).toThrow(/SHA-256/i);
	});

	it("asserts exact clean GitHub and Gitea main plus reviewed ancestry", () => {
		const fixture = createFixture();
		const plan = loadSoloReleasePlan(fixture.planPath);
		const calls: string[] = [];
		const fake = (_command: string, args: string[]) => {
			calls.push(args.join(" "));
			if (args[0] === "status") return "";
			if (args[0] === "branch") return "main";
			if (args[0] === "ls-remote") return `${"a".repeat(40)}\trefs/heads/main`;
			if (args[1] === "HEAD^{tree}") return "b".repeat(40);
			if (args[0] === "merge-base") return "";
			return "a".repeat(40);
		};
		expect(assertCanonicalMain(fixture.root, plan, fake)).toEqual({
			head: "a".repeat(40),
			tree: "b".repeat(40),
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

	it("models resumable promotion without accepting an unexpected latest value", () => {
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
	});

	it("packs one immutable external cohort manifest with source, tree, lock, and tarball SHA-512", () => {
		const fixture = createFixture();
		const plan = loadSoloReleasePlan(fixture.planPath);
		applySoloReleasePlan(fixture.root, plan);
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
			writeFileSync(join(dist, "index.d.ts"), "export declare const built: true;\n");
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
		});
		expect(built).toEqual(packages.map(({ name }) => name));
		expect(result.manifest.source).toMatchObject({
			commit: "a".repeat(40),
			tree: "b".repeat(40),
			upstreamCommit: "3".repeat(40),
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
		expect(
			existsSync(join(fixture.root, `${plan.releaseId}.provenance.json`)),
		).toBe(false);
	});

	it("preflights the artifact output before deleting any build output", () => {
		const fixture = createFixture();
		const plan = loadSoloReleasePlan(fixture.planPath);
		applySoloReleasePlan(fixture.root, plan);
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
			}),
		).toThrow(/new and empty/i);
		expect(readFileSync(stale, "utf8")).toBe("preserve on refusal\n");
	});

	it("rejects an archive missing any conditional export target", () => {
		const fixture = createFixture();
		const plan = loadSoloReleasePlan(fixture.planPath);
		applySoloReleasePlan(fixture.root, plan);
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
		expect(() =>
			assertLivePromotedCohort(manifest, plan, {}, view),
		).toThrow(/live latest/i);
	});

	it("creates, resumes, and fetch-verifies every source release asset", async () => {
		const expected = createExpectedRelease();
		const adapter = createReleaseAdapter("fixture", expected);
		await expect(reconcileReleaseWithAdapter(expected, adapter)).resolves.toEqual({
			tag: expected.tag,
			assets: expected.assets.map(({ name }) => name),
		});
		expect(adapter.calls).toMatchObject({
			create: 1,
			upload: expected.assets.length,
			download: expected.assets.length,
		});
		await reconcileReleaseWithAdapter(expected, adapter);
		expect(adapter.calls.create).toBe(1);
		expect(adapter.calls.upload).toBe(expected.assets.length);
		expect(adapter.calls.download).toBe(expected.assets.length * 3);
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
