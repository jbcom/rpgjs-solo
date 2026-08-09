import { execFileSync, spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseNpmAuditReport } from "./command-report-contracts.mjs";
import { npmChildEnvironment } from "./npm-child-environment.mjs";
import {
	inspectPortablePackageArchive,
	packPackageArchive,
} from "./package-archive-contracts.mjs";

const rootDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const packageDirectory = join(rootDirectory, "packages", "vite");
const temporaryDirectory = mkdtempSync(
	join(tmpdir(), "rpgjs-published-package-contracts-"),
);
const packDirectory = join(temporaryDirectory, "pack");
const consumerDirectory = join(temporaryDirectory, "consumer");
const commandTimeoutMs = 300_000;
const commandMaxBuffer = 32 * 1024 * 1024;
const npmEnvironment = npmChildEnvironment();

const run = (command, arguments_, options = {}) =>
	execFileSync(command, arguments_, {
		cwd: consumerDirectory,
		encoding: "utf8",
		stdio: "pipe",
		timeout: commandTimeoutMs,
		maxBuffer: commandMaxBuffer,
		env: command === "npm" ? npmEnvironment : process.env,
		...options,
	});

try {
	mkdirSync(consumerDirectory);

	const { archivePath } = packPackageArchive({
		packageDirectory,
		destinationDirectory: packDirectory,
	});
	const { packedManifest } = inspectPortablePackageArchive({
		archivePath,
		extractDirectory: join(packDirectory, "extract"),
		packageName: "@rpgjs/vite",
	});
	if (packedManifest.name !== "@rpgjs/vite") {
		throw new Error(
			`Expected packed @rpgjs/vite, received ${String(packedManifest.name)}`,
		);
	}

	const forbiddenDependencies = ["@hono/vite-dev-server", "@hono/node-server"];
	const manifestDependencyFields = [
		"dependencies",
		"optionalDependencies",
		"peerDependencies",
	];
	for (const dependencyName of forbiddenDependencies) {
		for (const field of manifestDependencyFields) {
			if (packedManifest[field]?.[dependencyName]) {
				throw new Error(
					`Packed @rpgjs/vite still publishes unused ${dependencyName} in ${field}`,
				);
			}
		}
	}

	writeFileSync(
		join(consumerDirectory, "package.json"),
		`${JSON.stringify(
			{
				name: "rpgjs-vite-published-contract-consumer",
				private: true,
				dependencies: {
					"@rpgjs/vite": `file:${relative(consumerDirectory, archivePath)}`,
				},
			},
			null,
			2,
		)}\n`,
	);

	run("npm", [
		"install",
		"--ignore-scripts",
		"--no-audit",
		"--no-fund",
		"--registry=https://registry.npmjs.org/",
	]);

	const consumerLock = JSON.parse(
		readFileSync(join(consumerDirectory, "package-lock.json"), "utf8"),
	);
	const installedPaths = Object.keys(consumerLock.packages ?? {});
	for (const dependencyName of forbiddenDependencies) {
		const dependencyPath = `node_modules/${dependencyName}`;
		if (installedPaths.includes(dependencyPath)) {
			throw new Error(
				`External @rpgjs/vite consumer installed forbidden ${dependencyName}`,
			);
		}
	}

	const auditResult = spawnSync(
		"npm",
		["audit", "--audit-level=low", "--json"],
		{
			cwd: consumerDirectory,
			encoding: "utf8",
			stdio: "pipe",
			timeout: commandTimeoutMs,
			maxBuffer: commandMaxBuffer,
			env: npmEnvironment,
		},
	);
	parseNpmAuditReport(auditResult, "External @rpgjs/vite consumer audit");

	console.log(
		"@rpgjs/vite external packed dependency and audit contract passed",
	);
} finally {
	rmSync(temporaryDirectory, { recursive: true, force: true });
}
