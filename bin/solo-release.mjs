#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
	inspectPortablePackageArchive,
	packPackageArchive,
} from "./package-archive-contracts.mjs";

export const rootDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
export const defaultPlanPath = join(
	rootDirectory,
	"docs/internal/releases/solo-beta29-solo1.plan.json",
);
const dependencyFields = [
	"dependencies",
	"devDependencies",
	"optionalDependencies",
	"peerDependencies",
];
const relevantInheritedPackages = new Set([
	"@rpgjs/action-battle",
	"@rpgjs/client",
	"@rpgjs/studio",
]);
const canonicalMetadata = {
	repositoryUrl: "git+https://github.com/jbcom/rpgjs-solo.git",
	homepageRoot: "https://github.com/jbcom/rpgjs-solo/tree/main/",
	bugsUrl: "https://github.com/jbcom/rpgjs-solo/issues",
};

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, value) =>
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const digest = (algorithm, value) =>
	createHash(algorithm).update(value).digest("hex");
export const sha256File = (path) => digest("sha256", readFileSync(path));
export const sha512File = (path) => digest("sha512", readFileSync(path));
const sri512File = (path) =>
	`sha512-${createHash("sha512").update(readFileSync(path)).digest("base64")}`;

const assert = (condition, message) => {
	if (!condition) throw new Error(message);
};

const run = (command, args, options = {}) =>
	execFileSync(command, args, {
		cwd: options.cwd ?? rootDirectory,
		encoding: "utf8",
		stdio: options.stdio ?? "pipe",
		env: options.env ?? process.env,
		timeout: options.timeout ?? 300_000,
		maxBuffer: 32 * 1024 * 1024,
	}).trim();

const parseVersion = (version) => {
	const match = /^(\d+\.\d+\.\d+-beta\.\d+)\.solo\.(\d+)$/.exec(version);
	assert(match, `Invalid Solo version ${version}`);
	return { upstream: match[1], counter: Number(match[2]) };
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
	const plan = readJson(planPath);
	assert(plan.schemaVersion === 1, "Unsupported Solo release plan schema");
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
		"requiredSourceCommit must be immutable",
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
		"@jbcom/rpgjs-solo",
		"@jbcom/rpgjs-solo-action-battle",
		"@jbcom/rpgjs-solo-renderer",
		"@jbcom/rpgjs-solo-vite",
	];
	assert(
		plan.packages.every(
			(record, index) =>
				record.name === expectedPackages[index] &&
				record.directory.startsWith("packages/") &&
				record.tag.endsWith(`-v${plan.version}`),
		),
		"Solo package order, directory, or immutable tag drifted",
	);
	const releaseInputs = [...plan.consumedChangesets, ...plan.carriedChangesets];
	assert(
		new Set(releaseInputs.map(({ id }) => id)).size === releaseInputs.length &&
			releaseInputs.every(
				({ id, sha256 }) =>
					/^[a-z0-9][a-z0-9-]*$/.test(id) && /^[0-9a-f]{64}$/.test(sha256),
			),
		"Release changeset identities must be unique and hash-bound",
	);
	const studioCarry = plan.carriedChangesets.find(
		({ id }) => id === "fair-studio-success-rates",
	);
	if (studioCarry) {
		assert(
			studioCarry.introducedBy === plan.requiredSourceCommit,
			"The post-review Studio carry input must bind the required source commit",
		);
	}
	assert(
		plan.requiredConsumer?.package === "@arcade-cabinet/rpgjs-patches" &&
			plan.requiredConsumer.version === "0.2.0",
		"The exact fleet compatibility consumer is required",
	);
	return { ...plan, planPath };
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
			(name) => name.endsWith(".md") && !preConsumed.has(name.slice(0, -3)),
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
		return parsed.releases.some(
			({ name }) => cohort.has(name) || relevantInheritedPackages.has(name),
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

const changelogEntry = (record, plan, changesets) => {
	const notes = changesets
		.filter(([, parsed]) =>
			parsed.releases.some(({ name }) => name === record.name),
		)
		.map(([id, parsed]) => `- ${parsed.summary}\n  (${id})`)
		.join("\n");
	return `# ${record.name}\n\n## ${plan.version}\n\n${notes}\n`;
};

export const applySoloReleasePlan = (root, plan) => {
	const state = validateSoloReleaseState(root, plan);
	if (state.phase === "applied") return { changed: false, phase: "applied" };
	const changesets = plan.consumedChangesets.map((entry) => [
		entry.id,
		checkChangeset(root, entry),
	]);
	const cohort = new Set(plan.packages.map(({ name }) => name));
	for (const path of walkPackageJson(root)) {
		const manifest = readJson(path);
		let changed = false;
		if (cohort.has(manifest.name)) {
			manifest.version = plan.version;
			changed = true;
		}
		for (const field of dependencyFields) {
			for (const [name, version] of Object.entries(manifest[field] ?? {})) {
				if (cohort.has(name)) {
					assert(
						version === `workspace:${plan.previousVersion}`,
						`${relative(root, path)} has an unsafe Solo dependency transition`,
					);
					manifest[field][name] = `workspace:${plan.version}`;
					changed = true;
				}
			}
		}
		if (changed) writeJson(path, manifest);
	}
	for (const record of plan.packages) {
		const path = join(root, record.directory, "CHANGELOG.md");
		assert(
			!existsSync(path),
			`${record.name} already has a changelog; planner refuses to guess insertion semantics`,
		);
		writeFileSync(path, changelogEntry(record, plan, changesets));
	}
	for (const entry of plan.consumedChangesets)
		rmSync(join(root, ".changeset", `${entry.id}.md`));
	const result = validateSoloReleaseState(root, plan);
	return { changed: true, phase: result.phase };
};

const git = (args, cwd = rootDirectory) => run("git", args, { cwd });
const assertReleaseBase = (root, plan, command = run) => {
	assert(
		command("git", ["status", "--porcelain"], { cwd: root }) === "",
		"The version transition requires a clean worktree",
	);
	const head = command("git", ["rev-parse", "HEAD"], { cwd: root });
	command(
		"git",
		["merge-base", "--is-ancestor", plan.requiredSourceCommit, head],
		{ cwd: root },
	);
	command("git", ["merge-base", "--is-ancestor", plan.upstreamCommit, head], {
		cwd: root,
	});
	return head;
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
	command(
		"git",
		["merge-base", "--is-ancestor", plan.requiredSourceCommit, head],
		{ cwd: root },
	);
	command("git", ["merge-base", "--is-ancestor", plan.upstreamCommit, head], {
		cwd: root,
	});
	const tree = command("git", ["rev-parse", "HEAD^{tree}"], { cwd: root });
	return { head, tree };
};

const assertArtifactDirectory = (root, path) => {
	assert(
		path && isAbsolute(path),
		"--artifacts must be an absolute directory outside the repository",
	);
	const rootReal = realpathSync(root);
	const parent = existsSync(path)
		? realpathSync(path)
		: realpathSync(dirname(path));
	const resolved = existsSync(path)
		? parent
		: join(parent, path.split(sep).at(-1));
	assert(
		resolved !== rootReal && !resolved.startsWith(`${rootReal}${sep}`),
		"Release artifacts must remain outside the repository",
	);
	if (!existsSync(path)) mkdirSync(path, { recursive: false });
	assert(
		readdirSync(path).length === 0,
		"Release artifacts directory must be new and empty",
	);
};

export const createProvenanceManifest = ({
	root,
	plan,
	artifactsDirectory,
	source,
}) => {
	assertArtifactDirectory(root, artifactsDirectory);
	const packages = [];
	for (const record of plan.packages) {
		const packageArtifacts = join(
			artifactsDirectory,
			record.name.replaceAll("/", "-"),
		);
		mkdirSync(packageArtifacts);
		const { archivePath } = packPackageArchive({
			packageDirectory: join(root, record.directory),
			destinationDirectory: packageArtifacts,
		});
		const inspectionDirectory = join(packageArtifacts, "inspection");
		const { packedManifest } = inspectPortablePackageArchive({
			archivePath,
			extractDirectory: inspectionDirectory,
			packageName: record.name,
		});
		assert(
			packedManifest.name === record.name &&
				packedManifest.version === plan.version,
			`${record.name} archive identity drifted`,
		);
		const cohort = new Set(plan.packages.map(({ name }) => name));
		for (const [name, dependencyVersion] of Object.entries(
			packedManifest.dependencies ?? {},
		)) {
			if (cohort.has(name)) {
				assert(
					dependencyVersion === plan.version,
					`${record.name} archive has non-exact cohort dependency ${name}@${dependencyVersion}`,
				);
			}
		}
		rmSync(inspectionDirectory, { recursive: true, force: true });
		packages.push({
			name: record.name,
			version: plan.version,
			tag: record.tag,
			archive: relative(artifactsDirectory, archivePath),
			sha512: sha512File(archivePath),
			integrity: sri512File(archivePath),
			repository: packedManifest.repository,
			engines: packedManifest.engines,
			dependencies: packedManifest.dependencies ?? {},
		});
	}
	const changesetRecord = (entry) => ({ ...entry });
	const manifest = {
		schemaVersion: 1,
		releaseId: plan.releaseId,
		version: plan.version,
		source: {
			repository: plan.canonical.repository,
			branch: plan.canonical.branch,
			commit: source.head,
			tree: source.tree,
			requiredSourceCommit: plan.requiredSourceCommit,
			upstreamCommit: plan.upstreamCommit,
		},
		lockfile: {
			path: "pnpm-lock.yaml",
			sha512: sha512File(join(root, "pnpm-lock.yaml")),
		},
		plan: {
			path: relative(root, plan.planPath),
			sha512: sha512File(plan.planPath),
		},
		registry: plan.registry,
		candidateDistTag: plan.candidateDistTag,
		promotionDistTag: plan.promotionDistTag,
		trainTag: plan.trainTag,
		packages,
		consumedChangesets: plan.consumedChangesets.map(changesetRecord),
		carriedChangesets: plan.carriedChangesets.map(changesetRecord),
		requiredConsumer: plan.requiredConsumer,
	};
	const manifestPath = join(
		artifactsDirectory,
		`${plan.releaseId}.provenance.json`,
	);
	writeJson(manifestPath, manifest);
	const sidecarPath = `${manifestPath}.sha512`;
	writeFileSync(
		sidecarPath,
		`${sha512File(manifestPath)}  ${manifestPath.split(sep).at(-1)}\n`,
	);
	return { manifestPath, sidecarPath, manifest };
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
	writeFileSync(
		npmrc,
		`registry=https://registry.npmjs.org/\n@jbcom:registry=${registry}\n@arcade-cabinet:registry=${arcadeRegistry}\n//${registryPath}:_authToken=${token}\n//${arcadePath}:_authToken=${token}\nalways-auth=true\n`,
		{ mode: 0o600 },
	);
	chmodSync(npmrc, 0o600);
	try {
		const childEnvironment = {
			...process.env,
			npm_config_userconfig: npmrc,
		};
		delete childEnvironment.RPGJS_SOLO_NPM_TOKEN;
		return await callback(childEnvironment);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
};

const loadProvenance = (manifestPath, plan) => {
	assert(isAbsolute(manifestPath), "--manifest must be an absolute path");
	const manifest = readJson(manifestPath);
	assert(
		manifest.releaseId === plan.releaseId && manifest.version === plan.version,
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
		manifest.plan.sha512 === sha512File(plan.planPath),
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
		manifest.lockfile.sha512 ===
			sha512File(join(rootDirectory, manifest.lockfile.path)),
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
	for (const item of manifest.packages) {
		const archivePath = resolve(dirname(manifestPath), item.archive);
		assert(
			archivePath.startsWith(`${dirname(manifestPath)}${sep}`),
			"Archive escaped provenance directory",
		);
		assert(
			sha512File(archivePath) === item.sha512 &&
				sri512File(archivePath) === item.integrity,
			`${item.name} archive bytes drifted`,
		);
	}
	const sidecarPath = `${manifestPath}.sha512`;
	assert(existsSync(sidecarPath), "Provenance SHA-512 sidecar is missing");
	assert(
		readFileSync(sidecarPath, "utf8") ===
			`${sha512File(manifestPath)}  ${manifestPath.split(sep).at(-1)}\n`,
		"Provenance SHA-512 sidecar drifted",
	);
	return manifest;
};

const pnpmView = (spec, field, plan, env) => {
	try {
		const output = run(
			"pnpm",
			["view", spec, field, "--json", "--registry", plan.registry],
			{ env },
		);
		return output ? JSON.parse(output) : undefined;
	} catch {
		return undefined;
	}
};

export const assertCandidateCohort = (manifest, plan, env) => {
	for (const item of manifest.packages) {
		const tags = pnpmView(item.name, "dist-tags", plan, env);
		assert(
			tags?.[plan.candidateDistTag] === plan.version,
			`${item.name} candidate tag is not ${plan.version}`,
		);
		const integrity = pnpmView(
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

export const nextPromotionAction = ({
	currentLatest,
	priorLatest,
	version,
}) => {
	if (currentLatest === version) return "complete";
	if (currentLatest === priorLatest) return "promote";
	throw new Error(
		`latest changed unexpectedly from ${String(priorLatest)} to ${String(currentLatest)}`,
	);
};

const atomicWriteJson = (path, value) => {
	const temporary = `${path}.tmp-${process.pid}`;
	writeJson(temporary, value);
	renameSync(temporary, path);
};

const verifyPublishedConsumer = (manifest, plan, env) => {
	const directory = mkdtempSync(
		join(tmpdir(), "rpgjs-solo-registry-consumer-"),
	);
	try {
		writeJson(join(directory, "package.json"), {
			name: "rpgjs-solo-release-consumer",
			private: true,
			type: "module",
			dependencies: Object.fromEntries([
				...manifest.packages.map(({ name }) => [name, plan.version]),
				[plan.requiredConsumer.package, plan.requiredConsumer.version],
				["canvasengine", "2.1.1"],
				["pixi.js", "8.19.0"],
				["vite", "8.2.0"],
			]),
		});
		writeFileSync(
			join(directory, "check.mjs"),
			`import { SoloRuntime } from '@jbcom/rpgjs-solo'\nimport { SoloActionBattle } from '@jbcom/rpgjs-solo-action-battle'\nimport { resolveInitialMute } from '@jbcom/rpgjs-solo-renderer'\nimport { inspectSoloBundle } from '@jbcom/rpgjs-solo-vite'\nimport { installCanvasEnginePatches } from '@arcade-cabinet/rpgjs-patches'\nconst runtime = new SoloRuntime({ fixedStepMs: 16 })\nruntime.registerMap({ id: 'release', width: 32, height: 32, entities: [{ id: 'hero', kind: 'player', x: 1, y: 1 }] })\nruntime.setActiveMap('release')\nif (!new SoloActionBattle(runtime).canMove('hero').available) throw new Error('action battle failed')\nif (!resolveInitialMute({ autoMuteInTests: true }, true)) throw new Error('test mute failed')\nif (inspectSoloBundle({}).length !== 0) throw new Error('vite boundary failed')\nif (typeof installCanvasEnginePatches !== 'function') throw new Error('patch package failed')\n`,
		);
		run("pnpm", ["install", "--ignore-scripts"], {
			cwd: directory,
			env,
			timeout: 600_000,
		});
		run(process.execPath, ["check.mjs"], { cwd: directory, env });
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

const publishCandidate = async (manifest, manifestPath, plan, args) => {
	requireExecution(args, plan);
	await withEphemeralNpmAuth(
		process.env.RPGJS_SOLO_NPM_TOKEN,
		plan.registry,
		async (env) => {
			for (const item of manifest.packages) {
				const tags = pnpmView(item.name, "dist-tags", plan, env) ?? {};
				assert(
					tags[plan.candidateDistTag] === undefined ||
						tags[plan.candidateDistTag] === plan.version,
					`${item.name} candidate tag already points at a different version`,
				);
				const existing = pnpmView(
					`${item.name}@${plan.version}`,
					"dist.integrity",
					plan,
					env,
				);
				if (existing) {
					assert(
						existing === item.integrity,
						`${item.name}@${plan.version} already exists with foreign bytes`,
					);
					run(
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
					continue;
				}
				run(
					"pnpm",
					[
						"publish",
						resolve(dirname(manifestPath), item.archive),
						"--tag",
						plan.candidateDistTag,
						"--registry",
						plan.registry,
						"--no-git-checks",
					],
					{ env, timeout: 600_000 },
				);
				assert(
					pnpmView(
						`${item.name}@${plan.version}`,
						"dist.integrity",
						plan,
						env,
					) === item.integrity,
					`${item.name} fetch-back integrity failed`,
				);
			}
			assertCandidateCohort(manifest, plan, env);
		},
	);
};

const promoteLatest = async (manifest, manifestPath, plan, args) => {
	requireExecution(args, plan);
	const journalPath = `${manifestPath}.promotion.json`;
	await withEphemeralNpmAuth(
		process.env.RPGJS_SOLO_NPM_TOKEN,
		plan.registry,
		async (env) => {
			assertCandidateCohort(manifest, plan, env);
			let journal;
			if (existsSync(journalPath)) {
				journal = readJson(journalPath);
				assert(
					journal.releaseId === plan.releaseId &&
						journal.manifestSha512 === sha512File(manifestPath),
					"Promotion journal belongs to different bytes",
				);
			} else {
				journal = {
					schemaVersion: 1,
					releaseId: plan.releaseId,
					manifestSha512: sha512File(manifestPath),
					packages: Object.fromEntries(
						manifest.packages.map(({ name }) => {
							const tags = pnpmView(name, "dist-tags", plan, env) ?? {};
							return [
								name,
								{
									priorLatest: tags[plan.promotionDistTag] ?? null,
									complete: tags[plan.promotionDistTag] === plan.version,
								},
							];
						}),
					),
				};
				atomicWriteJson(journalPath, journal);
			}
			for (const item of manifest.packages) {
				const state = journal.packages[item.name];
				const tags = pnpmView(item.name, "dist-tags", plan, env) ?? {};
				const action = nextPromotionAction({
					currentLatest: tags[plan.promotionDistTag] ?? null,
					priorLatest: state.priorLatest,
					version: plan.version,
				});
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
				atomicWriteJson(journalPath, journal);
			}
			journal.complete = Object.values(journal.packages).every(
				({ complete }) => complete,
			);
			atomicWriteJson(journalPath, journal);
		},
	);
};

const publishReleases = (manifest, manifestPath, plan, args) => {
	requireExecution(args, plan);
	const journal = readJson(`${manifestPath}.promotion.json`);
	assert(
		journal.complete === true,
		"All latest promotions must complete before source releases",
	);
	const tags = [...plan.packages.map(({ tag }) => tag), plan.trainTag];
	for (const tag of tags) {
		let exists = true;
		try {
			git(["show-ref", "--verify", "--quiet", `refs/tags/${tag}`]);
		} catch {
			exists = false;
		}
		if (exists) {
			assert(
				git(["rev-parse", `${tag}^{}`]) === manifest.source.commit,
				`${tag} points at a different commit`,
			);
		} else {
			git(["tag", tag, manifest.source.commit]);
		}
	}
	for (const tag of tags)
		git([
			"push",
			plan.canonical.repository,
			`refs/tags/${tag}:refs/tags/${tag}`,
		]);
	const assets = [
		manifestPath,
		`${manifestPath}.sha512`,
		...manifest.packages.map(({ archive }) =>
			resolve(dirname(manifestPath), archive),
		),
	];
	const notesPath = join(
		dirname(manifestPath),
		`${plan.releaseId}.release-notes.md`,
	);
	writeFileSync(
		notesPath,
		`# RPGJS Solo ${plan.version}\n\nCanonical source: ${manifest.source.commit}\nTree: ${manifest.source.tree}\nUpstream RPGJS baseline: ${manifest.source.upstreamCommit}\nProvenance SHA-512: ${sha512File(manifestPath)}\n`,
	);
	run(
		"gh",
		[
			"release",
			"create",
			plan.trainTag,
			...assets,
			"--prerelease",
			"--verify-tag",
			"--latest=false",
			"--title",
			`RPGJS Solo ${plan.version}`,
			"--notes-file",
			notesPath,
			"-R",
			"jbcom/rpgjs-solo",
		],
		{ timeout: 600_000 },
	);
	for (const tag of tags)
		git(["push", plan.backup.repository, `refs/tags/${tag}:refs/tags/${tag}`]);
	run(
		"tea",
		[
			"releases",
			"create",
			"--tag",
			plan.trainTag,
			"--target",
			manifest.source.commit,
			"--title",
			`RPGJS Solo ${plan.version}`,
			"--note-file",
			notesPath,
			"--prerelease",
			...assets.flatMap((asset) => ["--asset", asset]),
			"--repo",
			plan.backup.apiRepository,
		],
		{ timeout: 600_000 },
	);
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

export const main = async (rawArguments = process.argv.slice(2)) => {
	const args = parseArguments(rawArguments);
	const plan = loadSoloReleasePlan(args.plan);
	if (args.command === "validate") {
		process.stdout.write(
			`${JSON.stringify(validateSoloReleaseState(rootDirectory, plan), null, 2)}\n`,
		);
		return;
	}
	if (args.command === "apply") {
		assertReleaseBase(rootDirectory, plan);
		const result = applySoloReleasePlan(rootDirectory, plan);
		if (result.changed)
			run("pnpm", ["install", "--lockfile-only"], {
				cwd: rootDirectory,
				stdio: "inherit",
				timeout: 600_000,
			});
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
			source.tree === manifest.source.tree,
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
		publishReleases(manifest, args.manifest, plan, args);
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
