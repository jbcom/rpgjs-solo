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

const run = (command, args, options = {}) => {
	const output = execFileSync(command, args, {
		cwd: options.cwd ?? rootDirectory,
		encoding: "utf8",
		stdio: options.stdio ?? "pipe",
		env: options.env ?? process.env,
		timeout: options.timeout ?? 300_000,
		maxBuffer: 32 * 1024 * 1024,
	});
	return options.trim === false ? output : output.trim();
};

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

const deriveReleaseRelevantPackages = (root, plan) => {
	const names = new Set(plan.packages.map(({ name }) => name));
	for (const directory of plan.inheritedReleaseDirectories) {
		const path = join(root, directory, "package.json");
		assert(existsSync(path), `Release surface package is missing: ${directory}`);
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

const changelogEntry = (record, plan, changesets) => {
	const notes = changesets
		.filter(([, parsed]) =>
			parsed.releases.some(({ name }) => name === record.name),
		)
		.map(([id, parsed]) => `- ${parsed.summary}\n  (${id})`)
		.join("\n");
	return `# ${record.name}\n\n## ${plan.version}\n\n${notes}\n`;
};

const collectManifestTransitions = (root, plan) => {
	const cohort = new Set(plan.packages.map(({ name }) => name));
	const transitions = [];
	for (const path of walkPackageJson(root)) {
		const manifest = readJson(path);
		let changed = false;
		if (cohort.has(manifest.name)) {
			assert(
				manifest.version === plan.previousVersion,
				`${manifest.name} has an unsafe source version`,
			);
			manifest.version = plan.version;
			changed = true;
		}
		for (const field of dependencyFields) {
			for (const [name, version] of Object.entries(manifest[field] ?? {})) {
				if (!cohort.has(name)) continue;
				assert(
					version === `workspace:${plan.previousVersion}`,
					`${relative(root, path)} has an unsafe Solo dependency transition`,
				);
				manifest[field][name] = `workspace:${plan.version}`;
				changed = true;
			}
		}
		if (changed) transitions.push({ path, manifest });
	}
	return transitions;
};

const preflightApplyOutputs = (root, plan) => {
	for (const record of plan.packages) {
		const path = join(root, record.directory, "CHANGELOG.md");
		assert(
			!existsSync(path),
			`${record.name} already has a changelog; planner refuses to guess insertion semantics`,
		);
		assert(
			existsSync(dirname(path)),
			`${record.name} changelog parent directory is missing`,
		);
	}
};

export const applySoloReleasePlan = (root, plan) => {
	const state = validateSoloReleaseState(root, plan);
	if (state.phase === "applied") return { changed: false, phase: "applied" };
	const changesets = plan.consumedChangesets.map((entry) => [
		entry.id,
		checkChangeset(root, entry),
	]);
	preflightApplyOutputs(root, plan);
	const transitions = collectManifestTransitions(root, plan);
	for (const { path, manifest } of transitions) writeJson(path, manifest);
	for (const record of plan.packages) {
		const path = join(root, record.directory, "CHANGELOG.md");
		writeFileSync(path, changelogEntry(record, plan, changesets));
	}
	for (const entry of plan.consumedChangesets)
		rmSync(join(root, ".changeset", `${entry.id}.md`));
	const result = validateSoloReleaseState(root, plan);
	return { changed: true, phase: result.phase };
};

const assertReleaseCommitAncestry = (root, plan, head, command = run) => {
	assert(
		plan.sourceBinding.status === "final",
		"Replace both provisional source bindings with the exact PR merge commit before release execution",
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

const plannedApplyPaths = (root, plan) => {
	const cohort = new Set(plan.packages.map(({ name }) => name));
	const paths = new Set([
		"pnpm-lock.yaml",
		...plan.consumedChangesets.map(({ id }) => `.changeset/${id}.md`),
		...plan.packages.map(({ directory }) => `${directory}/CHANGELOG.md`),
	]);
	for (const path of walkPackageJson(root)) {
		const manifest = readJson(path);
		const names = dependencyFields.flatMap((field) =>
			Object.keys(manifest[field] ?? {}),
		);
		if (cohort.has(manifest.name) || names.some((name) => cohort.has(name)))
			paths.add(relative(root, path));
	}
	return paths;
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

const assertAppliedRetryFiles = (root, plan, paths, command = run) => {
	const changesets = plan.consumedChangesets.map((entry) => {
		const path = `.changeset/${entry.id}.md`;
		const source = command("git", ["show", `HEAD:${path}`], {
			cwd: root,
			trim: false,
		});
		assert(
			digest("sha256", source) === entry.sha256,
			`${entry.id} HEAD bytes differ from the release plan`,
		);
		return [entry.id, parseChangeset(source, entry.id)];
	});
	for (const path of paths) {
		if (path === "pnpm-lock.yaml") continue;
		const consumed = plan.consumedChangesets.find(
			({ id }) => path === `.changeset/${id}.md`,
		);
		if (consumed) {
			assert(
				!existsSync(join(root, path)),
				`${consumed.id} must remain consumed during apply retry`,
			);
			continue;
		}
		const changelog = plan.packages.find(
			({ directory }) => path === `${directory}/CHANGELOG.md`,
		);
		if (changelog) {
			assert(
				readFileSync(join(root, path), "utf8") ===
					changelogEntry(changelog, plan, changesets),
				`${changelog.name} changelog differs from deterministic release output`,
			);
			continue;
		}
		assert(path.endsWith("/package.json") || path === "package.json", `${path} is not a planned apply output`);
		const headSource = command("git", ["show", `HEAD:${path}`], {
			cwd: root,
			trim: false,
		});
		assert(
			readFileSync(join(root, path), "utf8") ===
				expectedAppliedManifest(headSource, path, plan),
			`${path} differs from deterministic release output`,
		);
	}
};

const assertReleaseBase = (root, plan, phase, command = run) => {
	if (phase === "source") {
		assert(
			command("git", ["status", "--porcelain"], { cwd: root }) === "",
			"The version transition requires a clean worktree",
		);
	} else {
		const allowed = plannedApplyPaths(root, plan);
		const changed = changedWorktreePaths(root, command);
		const unexpected = changed.filter(
			(path) => !allowed.has(path),
		);
		assert(
			unexpected.length === 0,
			`Applied release retry contains unrelated changes: ${unexpected.join(", ")}`,
		);
		assertAppliedRetryFiles(root, plan, changed, command);
	}
	assert(
		["source", "applied"].includes(phase),
		"Unknown release application phase",
	);
	const head = command("git", ["rev-parse", "HEAD"], { cwd: root });
	assertReleaseCommitAncestry(root, plan, head, command);
	return head;
};

export const applySoloReleaseTransaction = (
	root,
	plan,
	command = run,
) => {
	const before = validateSoloReleaseState(root, plan);
	assertReleaseBase(root, plan, before.phase, command);
	const result = applySoloReleasePlan(root, plan);
	command("pnpm", ["install", "--lockfile-only"], {
		cwd: root,
		stdio: "inherit",
		timeout: 600_000,
	});
	const after = validateSoloReleaseState(root, plan);
	assert(after.phase === "applied", "Solo release application did not persist");
	return { ...result, lockfileRefreshed: true };
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
	const tree = command("git", ["rev-parse", "HEAD^{tree}"], { cwd: root });
	return { head, tree };
};

const preflightArtifactDirectory = (root, path) => {
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
	if (existsSync(path))
		assert(
			readdirSync(path).length === 0,
			"Release artifacts directory must be new and empty",
		);
};

const collectExportTargets = (value, targets = []) => {
	if (typeof value === "string") targets.push(value);
	else if (Array.isArray(value))
		for (const item of value) collectExportTargets(item, targets);
	else if (value && typeof value === "object")
		for (const item of Object.values(value)) collectExportTargets(item, targets);
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

const cleanBuildSoloCohort = (root, plan, command = run) => {
	for (const record of plan.packages)
		rmSync(join(root, record.directory, "dist"), {
			recursive: true,
			force: true,
		});
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
	}
};

export const createProvenanceManifest = ({
	root,
	plan,
	artifactsDirectory,
	source,
	command = run,
}) => {
	assert(
		validateSoloReleaseState(root, plan).phase === "applied",
		"Provenance requires the applied version phase",
	);
	preflightArtifactDirectory(root, artifactsDirectory);
	cleanBuildSoloCohort(root, plan, command);
	if (!existsSync(artifactsDirectory))
		mkdirSync(artifactsDirectory, { recursive: false });
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
			exports: packedManifest.exports,
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

export const assertCandidateCohort = (
	manifest,
	plan,
	env,
	view = pnpmView,
) => {
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
				assert(
					JSON.stringify(Object.keys(journal.packages ?? {}).sort()) ===
						JSON.stringify(
							manifest.packages.map(({ name }) => name).sort(),
						) &&
						Object.values(journal.packages).every(
							(state) =>
								state &&
								(state.priorLatest === null ||
									typeof state.priorLatest === "string"),
						),
					"Promotion journal package state drifted",
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
			atomicWriteJson(journalPath, journal);
		},
	);
};

const errorLooksMissing = (error) =>
	/404|not found|does not exist|no release|unknown revision|needed a single revision|ambiguous argument/i.test(
		`${error?.message ?? ""}\n${error?.stdout ?? ""}\n${error?.stderr ?? ""}`,
	);

const repositorySlug = (repository) => {
	const path = new URL(repository).pathname.replace(/^\//, "").replace(/\.git$/, "");
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

const reconcileRemoteTags = (
	repository,
	tags,
	commit,
	command = run,
) => {
	for (const tag of tags) {
		const current = remoteTagTarget(repository, tag, command);
		assert(
			current === undefined || current === commit,
			`${tag} already points at a different remote commit`,
		);
		if (current === undefined)
			command(
				"git",
				[
					"push",
					repository,
					`refs/tags/${tag}:refs/tags/${tag}`,
				],
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
		...manifest.packages.map(({ archive }) =>
			resolve(dirname(manifestPath), archive),
		),
	];
	for (const path of sourcePaths)
		assert(existsSync(path), `Release evidence is missing: ${path}`);
	if (existsSync(notesPath))
		assert(
			readFileSync(notesPath, "utf8") === notes,
			"Existing release-note output has foreign bytes",
		);
	const names = [...sourcePaths.map((path) => basename(path)), basename(notesPath)];
	assert(new Set(names).size === names.length, "Release asset names collide");
	if (writeNotes && !existsSync(notesPath)) writeFileSync(notesPath, notes);
	const assets = sourcePaths.map((path) => ({
		path,
		name: basename(path),
		sha512: sha512File(path),
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

const assertReleaseMetadata = (release, expected, provider) => {
	assert(release, `${provider} release is missing after creation`);
	assert(release.tag === expected.tag, `${provider} release tag drifted`);
	assert(
		release.target === expected.target,
		`${provider} release target drifted`,
	);
	assert(release.title === expected.title, `${provider} release title drifted`);
	assert(release.body === expected.body, `${provider} release notes drifted`);
	assert(
		release.prerelease === expected.prerelease && release.draft !== true,
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
	assert(extra.length === 0, `${provider} release has foreign assets: ${extra}`);
	if (!allowMissing) {
		const missing = [...expectedNames].filter((name) => !byName.has(name));
		assert(missing.length === 0, `${provider} release is missing assets: ${missing}`);
	}
	return byName;
};

const verifyRemoteAsset = async (adapter, release, remoteAsset, expectedAsset) => {
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
	if (!release) {
		await adapter.createRelease(expected);
		release = await adapter.getRelease(expected.tag);
	}
	assertReleaseMetadata(release, expected, adapter.name);
	let assets = indexReleaseAssets(release, expected, adapter.name, true);
	for (const expectedAsset of expected.assets) {
		const existing = assets.get(expectedAsset.name);
		if (existing)
			await verifyRemoteAsset(adapter, release, existing, expectedAsset);
		else await adapter.uploadAsset(release, expectedAsset);
	}
	release = await adapter.getRelease(expected.tag);
	assertReleaseMetadata(release, expected, adapter.name);
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

const createGitHubReleaseAdapter = (plan, command = run) => {
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
		createRelease(expected) {
			command(
				"gh",
				[
					"release",
					"create",
					expected.tag,
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

const createGiteaReleaseAdapter = (plan, command = run) => {
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
		createRelease(expected) {
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
					"--prerelease",
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
	const identity = {
		schemaVersion: 1,
		releaseId: plan.releaseId,
		manifestSha512: sha512File(manifestPath),
		assets: Object.fromEntries(
			expected.assets.map(({ name, sha512 }) => [name, sha512]),
		),
	};
	let journal;
	if (existsSync(journalPath)) {
		journal = readJson(journalPath);
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
	if (!existsSync(journalPath)) atomicWriteJson(journalPath, journal);
	if (!existsSync(expected.notesPath))
		writeFileSync(expected.notesPath, expected.body);
	const tags = [...plan.packages.map(({ tag }) => tag), plan.trainTag];
	reconcileLocalTags(tags, manifest.source.commit);
	reconcileRemoteTags(
		plan.canonical.repository,
		tags,
		manifest.source.commit,
	);
	const github = createGitHubReleaseAdapter(plan);
	const gitea = createGiteaReleaseAdapter(plan);
	await reconcileReleaseRemotes({
		expected,
		remotes: [github],
		onVerified(name, result) {
			journal.remotes[name] = result;
			atomicWriteJson(journalPath, journal);
		},
	});
	reconcileRemoteTags(
		plan.backup.repository,
		tags,
		manifest.source.commit,
	);
	await reconcileReleaseRemotes({
		expected,
		remotes: [gitea],
		onVerified(name, result) {
			journal.remotes[name] = result;
			atomicWriteJson(journalPath, journal);
		},
	});
	journal.complete = ["github", "gitea"].every(
		(name) => journal.remotes[name]?.tag === plan.trainTag,
	);
	assert(journal.complete, "Source release reconciliation is incomplete");
	atomicWriteJson(journalPath, journal);
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
