import { execFileSync } from "node:child_process";
import {
	afterEach,
	describe,
	expect,
	it,
} from "vitest";
import {
	mkdtempSync,
	mkdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { inspectPortablePackageArchive } from "./package-archive-contracts.mjs";

const temporaryDirectories: string[] = [];

const createArchive = ({
	manifest = {
		name: "archive-contract-fixture",
		version: "1.0.0",
		dependencies: { signal: "1.0.0" },
	},
	files = { "dist/index.js": 'import "signal";\n' },
}: {
	manifest?: Record<string, unknown>;
	files?: Record<string, string>;
} = {}) => {
	const directory = mkdtempSync(join(tmpdir(), "rpgjs-archive-fixture-"));
	temporaryDirectories.push(directory);
	const packageDirectory = join(directory, "package");
	mkdirSync(packageDirectory);
	writeFileSync(
		join(packageDirectory, "package.json"),
		`${JSON.stringify(manifest, null, 2)}\n`,
	);
	for (const [path, source] of Object.entries(files)) {
		const filePath = join(packageDirectory, path);
		mkdirSync(dirname(filePath), { recursive: true });
		writeFileSync(filePath, source);
	}
	const archivePath = join(directory, "fixture.tgz");
	execFileSync("tar", ["-czf", archivePath, "-C", directory, "package"]);
	return { archivePath, directory };
};

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("portable package archive contracts", () => {
	it("accepts portable manifests, entries, runtime imports, and declarations", () => {
		const { archivePath, directory } = createArchive({
			files: {
				"dist/index.js": 'import value from "signal";\nexport { value };\n',
				"dist/index.d.ts": 'export type Value = import("signal").Value;\n',
			},
		});

		expect(() =>
			inspectPortablePackageArchive({
				archivePath,
				extractDirectory: join(directory, "extract"),
				packageName: "archive-contract-fixture",
			}),
		).not.toThrow();
	});

	it.each([
		["workspace manifest", { dependencies: { signal: "workspace:*" } }, {}],
		[
			"pnpm-layout archive member",
			{},
			{ "dist/node_modules/.pnpm/signal/index.js": "export {};\n" },
		],
		[
			"CommonJS local reference",
			{},
			{ "dist/index.cjs": 'require("file:../signal");\n' },
		],
		[
			"declaration absolute reference",
			{},
			{ "dist/index.d.ts": 'export type Value = import("/tmp/signal").Value;\n' },
		],
	])("rejects a %s", (_name, manifestOverrides, files) => {
		const { archivePath, directory } = createArchive({
			manifest: {
				name: "archive-contract-fixture",
				version: "1.0.0",
				...manifestOverrides,
			},
			files,
		});

		expect(() =>
			inspectPortablePackageArchive({
				archivePath,
				extractDirectory: join(directory, "extract"),
				packageName: "archive-contract-fixture",
			}),
		).toThrow(/non-portable|retains local/);
	});
});
