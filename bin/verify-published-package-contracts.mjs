import { execFileSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const packageDirectory = join(rootDirectory, "packages", "vite");
const temporaryDirectory = mkdtempSync(
	join(tmpdir(), "rpgjs-published-package-contracts-"),
);
const packDirectory = join(temporaryDirectory, "pack");
const consumerDirectory = join(temporaryDirectory, "consumer");

const run = (command, arguments_, options = {}) =>
	execFileSync(command, arguments_, {
		cwd: consumerDirectory,
		encoding: "utf8",
		stdio: "pipe",
		...options,
	});

try {
	mkdirSync(packDirectory);
	mkdirSync(consumerDirectory);

	execFileSync("pnpm", ["pack", "--pack-destination", packDirectory], {
		cwd: packageDirectory,
		stdio: "pipe",
	});
	const archive = readdirSync(packDirectory).find((name) =>
		name.endsWith(".tgz"),
	);
	if (!archive)
		throw new Error("pnpm pack did not create an @rpgjs/vite archive");

	const archivePath = join(packDirectory, archive);
	const packedManifest = JSON.parse(
		execFileSync("tar", ["-xOf", archivePath, "package/package.json"], {
			encoding: "utf8",
		}),
	);
	if (packedManifest.name !== "@rpgjs/vite") {
		throw new Error(
			`Expected packed @rpgjs/vite, received ${String(packedManifest.name)}`,
		);
	}
	if (JSON.stringify(packedManifest).includes("workspace:")) {
		throw new Error(
			"Packed @rpgjs/vite manifest still contains a workspace protocol",
		);
	}

	const forbiddenDependencies = ["@hono/vite-dev-server", "@hono/node-server"];
	for (const dependencyName of forbiddenDependencies) {
		if (packedManifest.dependencies?.[dependencyName]) {
			throw new Error(
				`Packed @rpgjs/vite still publishes unused ${dependencyName}`,
			);
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

	let auditOutput;
	try {
		auditOutput = run("npm", ["audit", "--audit-level=low", "--json"]);
	} catch (error) {
		auditOutput = error.stdout?.toString() ?? "";
	}
	const audit = JSON.parse(auditOutput);
	if ((audit.metadata?.vulnerabilities?.total ?? 0) !== 0) {
		throw new Error(
			`External @rpgjs/vite consumer audit found ${String(audit.metadata?.vulnerabilities?.total)} vulnerabilities`,
		);
	}

	console.log(
		"@rpgjs/vite external packed dependency and audit contract passed",
	);
} finally {
	rmSync(temporaryDirectory, { recursive: true, force: true });
}
