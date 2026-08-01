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

let output;
try {
	output = execFileSync("pnpm", ["-r", "outdated", "--format", "json"], {
		encoding: "utf8",
		stdio: "pipe",
	});
} catch (error) {
	output = error.stdout?.toString() ?? "";
}

const outdated = output.trim() ? JSON.parse(output) : {};
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
	accepted.push(
		`${packageName} ${detail.current} -> ${detail.latest}: ${reason}`,
	);
}

if (unresolved.length > 0) {
	throw new Error(
		`Compatible dependency updates remain:\n${unresolved.join("\n")}`,
	);
}

console.log(
	`Workspace dependency currency passed; ${accepted.length} explicit major boundaries remain:\n${accepted.join("\n")}`,
);
