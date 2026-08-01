import { execFileSync } from "node:child_process";

const intentionalMajorBoundaries = new Map([
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

const major = (version) => {
	const match = /^(\d+)\./.exec(version);
	if (!match) throw new Error(`Cannot read semantic major from ${version}`);
	return Number(match[1]);
};

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
		{ headers: { accept: "application/vnd.npm.install-v1+json" } },
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

let output;
try {
	output = execFileSync("pnpm", ["-r", "outdated", "--format", "json"], {
		encoding: "utf8",
		stdio: "pipe",
	});
} catch (error) {
	output = error.stdout?.toString() ?? "";
}

if (!output.trim()) {
	throw new Error("pnpm outdated returned no JSON dependency report");
}

const outdated = JSON.parse(output);
const unresolved = [];
const accepted = [];

for (const [packageName, detail] of Object.entries(outdated)) {
	const boundary = intentionalMajorBoundaries.get(packageName);
	if (!boundary) {
		unresolved.push(`${packageName}: ${detail.current} -> ${detail.latest}`);
		continue;
	}
	const [expectedCurrentMajor, expectedLatestMajor, reason] = boundary;
	if (
		major(detail.current) !== expectedCurrentMajor ||
		major(detail.latest) !== expectedLatestMajor
	) {
		unresolved.push(
			`${packageName}: expected ${expectedCurrentMajor}.x -> ${expectedLatestMajor}.x boundary, received ${detail.current} -> ${detail.latest}`,
		);
		continue;
	}
	if (detail.current !== detail.wanted) {
		unresolved.push(
			`${packageName}: compatible update remains (${detail.current} installed, ${detail.wanted} wanted)`,
		);
		continue;
	}
	accepted.push({
		packageName,
		current: detail.current,
		latest: detail.latest,
		expectedCurrentMajor,
		reason,
	});
}

await Promise.all(
	accepted.map(async (boundary) => {
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
	`Workspace dependency currency passed; ${accepted.length} explicit major boundaries remain:\n${accepted
		.map(
			(boundary) =>
				`${boundary.packageName} ${boundary.current} (latest ${boundary.expectedCurrentMajor}.x) -> ${boundary.latest}: ${boundary.reason}`,
		)
		.join("\n")}`,
);
