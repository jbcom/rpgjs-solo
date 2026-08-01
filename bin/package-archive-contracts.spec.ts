import { execFileSync } from "node:child_process";
import {
	afterEach,
	describe,
	expect,
	it,
} from "vitest";
import {
	existsSync,
	mkdtempSync,
	mkdirSync,
	linkSync,
	readFileSync,
	rmSync,
	symlinkSync,
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
	hardlinks = {},
	symlinks = {},
}: {
	manifest?: Record<string, unknown>;
	files?: Record<string, string>;
	hardlinks?: Record<string, string>;
	symlinks?: Record<string, string>;
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
	for (const [path, target] of Object.entries(hardlinks)) {
		const filePath = join(packageDirectory, path);
		mkdirSync(dirname(filePath), { recursive: true });
		linkSync(join(packageDirectory, target), filePath);
	}
	for (const [path, target] of Object.entries(symlinks)) {
		const filePath = join(packageDirectory, path);
		mkdirSync(dirname(filePath), { recursive: true });
		symlinkSync(target, filePath);
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

	it("ignores import-shaped text in comments and strings", () => {
		const { archivePath, directory } = createArchive({
			files: {
				"dist/index.js": [
					'// documentation: import "/tmp/not-runtime.js"',
					'const note = \'require("file:../not-runtime.js")\';',
					"export { note };",
					"",
				].join("\n"),
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
			"CommonJS require.resolve local reference",
			{},
			{ "dist/index.cjs": 'require.resolve("/tmp/signal");\n' },
		],
		[
			"root package module local reference",
			{},
			{ "index.js": 'import "/tmp/signal";\n' },
		],
		[
			"CommonJS module bracket require local reference",
			{},
			{ "dist/index.cjs": 'module["require"]("/tmp/signal");\n' },
		],
		[
			"import.meta bracket resolve local reference",
			{},
			{ "dist/index.mjs": 'import.meta["resolve"]("/tmp/signal");\n' },
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

	it("rejects an existing extraction directory without modifying it", () => {
		const { archivePath, directory } = createArchive();
		const extractDirectory = join(directory, "extract");
		const sentinelPath = join(extractDirectory, "sentinel.txt");
		mkdirSync(extractDirectory);
		writeFileSync(sentinelPath, "preserve me\n");

		expect(() =>
			inspectPortablePackageArchive({
				archivePath,
				extractDirectory,
				packageName: "archive-contract-fixture",
			}),
		).toThrow(/fresh extraction directory/);
		expect(readFileSync(sentinelPath, "utf8")).toBe("preserve me\n");
		expect(existsSync(join(extractDirectory, "package"))).toBe(false);
	});

	it("rejects archive links before extraction", () => {
		const { archivePath, directory } = createArchive({
			files: {},
			symlinks: { "dist/escape.js": "/etc/hosts" },
		});
		const extractDirectory = join(directory, "extract");

		expect(() =>
			inspectPortablePackageArchive({
				archivePath,
				extractDirectory,
				packageName: "archive-contract-fixture",
			}),
		).toThrow(/link|entry type|non-portable/i);
		expect(() =>
			readFileSync(join(extractDirectory, "package/dist/escape.js")),
		).toThrow();
	});

	it("rejects archive hard links before extraction", () => {
		const { archivePath, directory } = createArchive({
			files: { "dist/target.js": "export {};\n" },
			hardlinks: { "dist/linked.js": "dist/target.js" },
		});
		const extractDirectory = join(directory, "extract");

		expect(() =>
			inspectPortablePackageArchive({
				archivePath,
				extractDirectory,
				packageName: "archive-contract-fixture",
			}),
		).toThrow(/link|entry type|non-portable/i);
		expect(() =>
			readFileSync(join(extractDirectory, "package/dist/linked.js")),
		).toThrow();
	});
});
