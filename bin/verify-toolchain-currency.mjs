import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	classifyPnpmOutdatedRows,
	collectPnpmOutdatedRows,
	parsePnpmLockImporterIds,
	parsePnpmOutdatedReport,
	parsePnpmWorkspaceProjects,
} from "./command-report-contracts.mjs";

const rootDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const commandTimeoutMs = 60_000;
const commandMaxBuffer = 32 * 1024 * 1024;

const intentionalMajorBoundaries = new Map([
	[
		"@changesets/cli",
		[
			2,
			3,
			"Changesets 3 prerelease-state migration and custom Solo release-verifier boundary",
		],
	],
	["@babel/generator", [7, 8, "Babel 8 migration boundary"]],
	["@babel/parser", [7, 8, "Babel 8 migration boundary"]],
	["@babel/traverse", [7, 8, "Babel 8 migration boundary"]],
	["@babel/types", [7, 8, "Babel 8 migration boundary"]],
	["@types/node", [24, 26, "Node 24 LTS runtime contract"]],
	["concurrently", [9, 10, "Concurrently 10 migration boundary"]],
	["execa", [9, 10, "Execa 10 migration boundary"]],
	["jsdom", [29, 30, "JSDOM 30 migration boundary"]],
	["magic-string", [0, 1, "Magic String 1 migration boundary"]],
	[
		"typescript",
		[6, 7, "TypeScript 6 source compiler and TypeScript 7 consumer-test split"],
	],
]);

const stableVersionParts = (version) => {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
	return match?.slice(1).map(Number);
};

const compareStableVersions = (left, right) => {
	const leftParts = stableVersionParts(left);
	const rightParts = stableVersionParts(right);
	if (!leftParts || !rightParts) {
		throw new Error(
			`Cannot compare stable semantic versions ${left} and ${right}`,
		);
	}
	for (let index = 0; index < leftParts.length; index += 1) {
		if (leftParts[index] !== rightParts[index]) {
			return leftParts[index] - rightParts[index];
		}
	}
	return 0;
};

const latestStableVersionInMajor = async (packageName, expectedMajor) => {
	const response = await fetch(
		`https://registry.npmjs.org/${encodeURIComponent(packageName)}`,
		{
			headers: { accept: "application/vnd.npm.install-v1+json" },
			signal: AbortSignal.timeout(15_000),
		},
	);
	if (!response.ok) {
		throw new Error(
			`npm registry metadata failed for ${packageName}: ${response.status}`,
		);
	}
	const metadata = await response.json();
	const matchingVersions = Object.keys(metadata.versions ?? {}).filter(
		(version) => stableVersionParts(version)?.[0] === expectedMajor,
	);
	matchingVersions.sort(compareStableVersions);
	const latestVersion = matchingVersions.at(-1);
	if (!latestVersion) {
		throw new Error(
			`npm registry has no stable ${expectedMajor}.x release for ${packageName}`,
		);
	}
	return latestVersion;
};

const projectListResult = spawnSync(
	"pnpm",
	["-r", "list", "--depth=-1", "--json"],
	{
		cwd: rootDirectory,
		encoding: "utf8",
		stdio: "pipe",
		timeout: commandTimeoutMs,
		maxBuffer: commandMaxBuffer,
	},
);

const projects = parsePnpmWorkspaceProjects(projectListResult);
const lockImporterIds = parsePnpmLockImporterIds(
	readFileSync(resolve(rootDirectory, "pnpm-lock.yaml"), "utf8"),
);
const projectImporterIds = projects.map((project) => {
	const importerId = relative(rootDirectory, resolve(project.path)) || ".";
	if (importerId === ".." || importerId.startsWith("../")) {
		throw new Error(
			`Workspace project escapes the repository: ${project.path}`,
		);
	}
	return importerId;
});
if (
	JSON.stringify([...projectImporterIds].sort()) !==
	JSON.stringify([...lockImporterIds].sort())
) {
	throw new Error(
		`Workspace project/lock importer mismatch:\nprojects=${projectImporterIds.sort().join(",")}\nlock=${lockImporterIds.sort().join(",")}`,
	);
}

const projectReports = projects.map((project, index) => {
	const importerId = projectImporterIds[index];
	const outdatedResult = spawnSync(
		"pnpm",
		["outdated", "--format", "json"],
		{
			cwd: project.path,
			encoding: "utf8",
			stdio: "pipe",
			timeout: commandTimeoutMs,
			maxBuffer: commandMaxBuffer,
		},
	);
	return {
		importerId,
		report: parsePnpmOutdatedReport(outdatedResult),
	};
});

const { unresolved, accepted } = classifyPnpmOutdatedRows(
	collectPnpmOutdatedRows(projectReports),
	intentionalMajorBoundaries,
);

const uniqueAcceptedBoundaries = [
	...new Map(
		accepted.map((boundary) => [
			[
				boundary.packageName,
				boundary.current,
				boundary.latest,
				boundary.expectedCurrentMajor,
			].join("\0"),
			boundary,
		]),
	).values(),
];

await Promise.all(
	uniqueAcceptedBoundaries.map(async (boundary) => {
		const latestCurrentMajor = await latestStableVersionInMajor(
			boundary.packageName,
			boundary.expectedCurrentMajor,
		);
		if (boundary.current !== latestCurrentMajor) {
			unresolved.push(
				`${boundary.packageName}: retained ${boundary.expectedCurrentMajor}.x line is stale (${boundary.current} installed, ${latestCurrentMajor} current)`,
			);
		}
	}),
);

if (unresolved.length > 0) {
	throw new Error(
		`Compatible dependency updates remain:\n${unresolved.join("\n")}`,
	);
}

console.log(
	`Workspace dependency currency passed across ${projects.length} exact importers; ${accepted.length} declared dependency lines cross ${uniqueAcceptedBoundaries.length} explicit major boundaries:\n${uniqueAcceptedBoundaries
		.map(
			(boundary) =>
				`${boundary.packageName} ${boundary.current} (latest ${boundary.expectedCurrentMajor}.x) -> ${boundary.latest}: ${boundary.reason}`,
		)
		.join("\n")}`,
);
