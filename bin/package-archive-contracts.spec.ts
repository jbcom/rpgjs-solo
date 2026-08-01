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
import { gzipSync } from "node:zlib";
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

const createTarHeader = (
	name: string,
	content: Buffer,
	type: "file" | "directory",
): Buffer => {
	const header = Buffer.alloc(512);
	const writeOctal = (value: number, offset: number, length: number) => {
		header.write(
			`${value.toString(8).padStart(length - 1, "0")}\0`,
			offset,
			length,
			"ascii",
		);
	};
	header.write(name, 0, 100, "utf8");
	writeOctal(type === "directory" ? 0o755 : 0o644, 100, 8);
	writeOctal(0, 108, 8);
	writeOctal(0, 116, 8);
	writeOctal(type === "directory" ? 0 : content.length, 124, 12);
	writeOctal(0, 136, 12);
	header.fill(0x20, 148, 156);
	header.write(type === "directory" ? "5" : "0", 156, 1, "ascii");
	header.write("ustar\0", 257, 6, "ascii");
	header.write("00", 263, 2, "ascii");
	const checksum = header.reduce((sum, byte) => sum + byte, 0);
	header.write(
		`${checksum.toString(8).padStart(6, "0")}\0 `,
		148,
		8,
		"ascii",
	);
	return header;
};

const createCraftedArchive = (
	entries: Array<{
		name: string;
		content?: string;
		type?: "file" | "directory";
	}>,
) => {
	const directory = mkdtempSync(join(tmpdir(), "rpgjs-crafted-archive-"));
	temporaryDirectories.push(directory);
	const blocks: Buffer[] = [];
	for (const entry of entries) {
		const type = entry.type ?? "file";
		const content = Buffer.from(entry.content ?? "", "utf8");
		blocks.push(createTarHeader(entry.name, content, type));
		if (type === "file") {
			blocks.push(content);
			const padding = (512 - (content.length % 512)) % 512;
			if (padding > 0) blocks.push(Buffer.alloc(padding));
		}
	}
	blocks.push(Buffer.alloc(1024));
	const archivePath = join(directory, "fixture.tgz");
	writeFileSync(archivePath, gzipSync(Buffer.concat(blocks)));
	return { archivePath, directory };
};

const expectRejectedBeforeExtraction = (
	archivePath: string,
	directory: string,
	error: RegExp,
) => {
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
	).toThrow(error);
	expect(readFileSync(sentinelPath, "utf8")).toBe("preserve me\n");
	expect(existsSync(join(extractDirectory, "package"))).toBe(false);
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

	it("rejects an internal empty path component before extraction", () => {
		const manifest = '{"name":"first"}\n';
		const { archivePath, directory } = createCraftedArchive([
			{ name: "package/", type: "directory" },
			{ name: "package/package.json", content: manifest },
			{ name: "package//package.json", content: '{"name":"second"}\n' },
		]);

		expectRejectedBeforeExtraction(
			archivePath,
			directory,
			/non-portable entry package\/\/package\.json/,
		);
	});

	it("rejects canonical file and directory member collisions before extraction", () => {
		const { archivePath, directory } = createCraftedArchive([
			{ name: "package/", type: "directory" },
			{ name: "package/package.json", content: '{"name":"fixture"}\n' },
			{ name: "package/dist/", type: "directory" },
			{ name: "package/dist", type: "directory" },
		]);

		expectRejectedBeforeExtraction(
			archivePath,
			directory,
			/canonical member collision package\/dist\/ and package\/dist/,
		);
	});

	it("rejects case-folded member aliases before extraction", () => {
		const { archivePath, directory } = createCraftedArchive([
			{ name: "package/", type: "directory" },
			{ name: "package/package.json", content: '{"name":"fixture"}\n' },
			{ name: "package/dist/", type: "directory" },
			{ name: "package/dist/Alias.js", content: "first\n" },
			{ name: "package/dist/alias.js", content: "second\n" },
		]);

		expectRejectedBeforeExtraction(
			archivePath,
			directory,
			/portable member collision package\/dist\/Alias\.js and package\/dist\/alias\.js/,
		);
	});

	it("rejects canonically equivalent Unicode member aliases before extraction", () => {
		const { archivePath, directory } = createCraftedArchive([
			{ name: "package/", type: "directory" },
			{ name: "package/package.json", content: '{"name":"fixture"}\n' },
			{ name: "package/dist/", type: "directory" },
			{ name: "package/dist/Caf\u00e9.js", content: "first\n" },
			{ name: "package/dist/Cafe\u0301.js", content: "second\n" },
		]);

		expectRejectedBeforeExtraction(
			archivePath,
			directory,
			/portable member collision/,
		);
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
