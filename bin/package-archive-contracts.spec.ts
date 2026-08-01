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
import {
	getDeterministicTarEnvironment,
	inspectPortablePackageArchive,
} from "./package-archive-contracts.mjs";

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
	name: string | Buffer,
	content: Buffer,
	type: "file" | "directory" | "gnu-long-name" | "pax-extended-header",
): Buffer => {
	const header = Buffer.alloc(512);
	const nameBytes = typeof name === "string" ? Buffer.from(name, "utf8") : name;
	if (nameBytes.length > 100) {
		throw new Error("Crafted tar fixture name exceeds the ustar header field");
	}
	const writeOctal = (value: number, offset: number, length: number) => {
		header.write(
			`${value.toString(8).padStart(length - 1, "0")}\0`,
			offset,
			length,
			"ascii",
		);
	};
	nameBytes.copy(header, 0);
	writeOctal(type === "directory" ? 0o755 : 0o644, 100, 8);
	writeOctal(0, 108, 8);
	writeOctal(0, 116, 8);
	writeOctal(type === "directory" ? 0 : content.length, 124, 12);
	writeOctal(0, 136, 12);
	header.fill(0x20, 148, 156);
	header.write(
		{
			file: "0",
			directory: "5",
			"gnu-long-name": "L",
			"pax-extended-header": "x",
		}[type],
		156,
		1,
		"ascii",
	);
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
		name: string | Buffer;
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

const appendTarEntry = (
	blocks: Buffer[],
	name: string | Buffer,
	content: Buffer,
	type: "file" | "directory" | "gnu-long-name" | "pax-extended-header",
) => {
	blocks.push(createTarHeader(name, content, type));
	if (type !== "directory") {
		blocks.push(content);
		const padding = (512 - (content.length % 512)) % 512;
		if (padding > 0) blocks.push(Buffer.alloc(padding));
	}
};

const createPaxPathRecord = (path: string) => {
	const payload = `path=${path}\n`;
	let length = Buffer.byteLength(payload, "utf8") + 2;
	while (true) {
		const record = `${length} ${payload}`;
		const actualLength = Buffer.byteLength(record, "utf8");
		if (actualLength === length) return Buffer.from(record, "utf8");
		length = actualLength;
	}
};

const createExtendedNameArchive = (
	memberName: string,
	format: "gnu-long-link" | "pax",
) => {
	const directory = mkdtempSync(join(tmpdir(), "rpgjs-extended-name-archive-"));
	temporaryDirectories.push(directory);
	const blocks: Buffer[] = [];
	appendTarEntry(blocks, "package/", Buffer.alloc(0), "directory");
	appendTarEntry(
		blocks,
		"package/package.json",
		Buffer.from('{"name":"archive-contract-fixture","version":"1.0.0"}\n'),
		"file",
	);
	appendTarEntry(blocks, "package/dist/", Buffer.alloc(0), "directory");
	if (format === "gnu-long-link") {
		appendTarEntry(
			blocks,
			"././@LongLink",
			Buffer.from(`${memberName}\0`, "utf8"),
			"gnu-long-name",
		);
	} else {
		appendTarEntry(
			blocks,
			"PaxHeaders/path",
			createPaxPathRecord(memberName),
			"pax-extended-header",
		);
	}
	appendTarEntry(
		blocks,
		"package/dist/placeholder",
		Buffer.from("safe\n", "utf8"),
		"file",
	);
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

const withTarEnvironment = <Result>(
	overrides: Record<string, string>,
	callback: () => Result,
): Result => {
	const previous = new Map(
		Object.keys(overrides).map((name) => [name, process.env[name]]),
	);
	Object.assign(process.env, overrides);
	try {
		return callback();
	} finally {
		for (const [name, value] of previous) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
	}
};

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("portable package archive contracts", () => {
	it("sanitizes tar controls case-insensitively while preserving unrelated environment", () => {
		withTarEnvironment(
			{
				Tar_Options: "--quoting-style=literal",
				tar_reader_options: "hdrcharset=ISO-8859-1",
				lc_all: "hostile-locale",
				RPGJS_ARCHIVE_ENV_SENTINEL: "preserved",
			},
			() => {
				const environment = getDeterministicTarEnvironment();
				expect(
					Object.keys(environment).filter((name) =>
						["TAR_OPTIONS", "TAR_READER_OPTIONS"].includes(
							name.toUpperCase(),
						),
					),
				).toEqual([]);
				expect(
					Object.entries(environment).filter(
						([name]) => name.toUpperCase() === "LC_ALL",
					),
				).toEqual([["LC_ALL", "C"]]);
				expect(environment.RPGJS_ARCHIVE_ENV_SENTINEL).toBe("preserved");
			},
		);
	});

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

	it.each([
		["small sharp S then capital sharp S", "ß", "ẞ"],
		["capital sharp S then small sharp S", "ẞ", "ß"],
		["Greek final sigma then sigma", "ς", "σ"],
		["Latin ff ligature then letters", "ﬀ", "ff"],
		["Latin long s then s", "ſ", "s"],
	])("rejects a full Unicode fold alias: %s before extraction", (_name, first, second) => {
		const { archivePath, directory } = createCraftedArchive([
			{ name: "package/", type: "directory" },
			{ name: "package/package.json", content: '{"name":"fixture"}\n' },
			{ name: "package/dist/", type: "directory" },
			{ name: `package/dist/fold-${first}.js`, content: "first\n" },
			{ name: `package/dist/fold-${second}.js`, content: "second\n" },
		]);

		expectRejectedBeforeExtraction(
			archivePath,
			directory,
			/portable member collision/,
		);
	});

	it("accepts Unicode names outside the full-fold equivalence classes", () => {
		const { archivePath, directory } = createCraftedArchive([
			{ name: "package/", type: "directory" },
			{ name: "package/package.json", content: '{"name":"fixture"}\n' },
			{ name: "package/dist/", type: "directory" },
			{ name: "package/dist/sharp-ß.js", content: "sharp s\n" },
			{ name: "package/dist/sharp-β.js", content: "beta\n" },
			{ name: "package/dist/sigma-ς.js", content: "final sigma\n" },
			{ name: "package/dist/sigma-ϲ.js", content: "lunate sigma\n" },
			{ name: "package/dist/ligature-ﬀ.js", content: "ligature\n" },
			{ name: "package/dist/ligature-f.js", content: "letter\n" },
			{ name: "package/dist/long-ſ.js", content: "long s\n" },
			{ name: "package/dist/long-l.js", content: "letter\n" },
		]);

		expect(() =>
			inspectPortablePackageArchive({
				archivePath,
				extractDirectory: join(directory, "extract"),
				packageName: "archive-contract-fixture",
			}),
		).not.toThrow();
	});

	it.each([
		["file then trailing dot alias", "package/dist/plugin.js", "package/dist/plugin.js."],
		["trailing dot alias then file", "package/dist/plugin.js.", "package/dist/plugin.js"],
		["file then trailing space alias", "package/dist/plugin.js", "package/dist/plugin.js   "],
		["trailing space alias then file", "package/dist/plugin.js   ", "package/dist/plugin.js"],
	])("rejects a Win32-trimmed %s before extraction", (_name, first, second) => {
		const { archivePath, directory } = createCraftedArchive([
			{ name: "package/", type: "directory" },
			{ name: "package/package.json", content: '{"name":"fixture"}\n' },
			{ name: "package/dist/", type: "directory" },
			{ name: first, content: "first\n" },
			{ name: second, content: "second\n" },
		]);

		expectRejectedBeforeExtraction(
			archivePath,
			directory,
			/Win32-trimmed trailing dot or space in component "plugin\.js(?:\.| {3})"/,
		);
	});

	it("rejects repeated mixed trailing dots and spaces in a nested component before extraction", () => {
		const { archivePath, directory } = createCraftedArchive([
			{ name: "package/", type: "directory" },
			{ name: "package/package.json", content: '{"name":"fixture"}\n' },
			{ name: "package/maps. .  /", type: "directory" },
			{ name: "package/maps. .  /region/data.json", content: "{}\n" },
		]);

		expectRejectedBeforeExtraction(
			archivePath,
			directory,
			/Win32-trimmed trailing dot or space in component "maps\. \.  "/,
		);
	});

	describe.each(["gnu-long-link", "pax"] as const)(
		"%s extended archive names",
		(format) => {
			it.each([
				["255 ASCII bytes and UTF-16 code units", "a".repeat(255)],
				["255 UTF-8 bytes with multibyte characters", `${"¢".repeat(127)}a`],
			])("accepts a component at the %s boundary", (_name, component) => {
				const { archivePath, directory } = createExtendedNameArchive(
					`package/dist/${component}`,
					format,
				);

				expect(() =>
					inspectPortablePackageArchive({
						archivePath,
						extractDirectory: join(directory, "extract"),
						packageName: "archive-contract-fixture",
					}),
				).not.toThrow();
			});

			it.each([
				[
					"256 ASCII UTF-16 code units",
					"a".repeat(256),
					/Win32 255 UTF-16-code-unit limit \(256\)/,
				],
				[
					"256 multibyte UTF-8 bytes",
					"¢".repeat(128),
					/common filesystem 255 UTF-8-byte limit \(256\)/,
				],
				[
					"128 astral code points occupying 256 UTF-16 code units",
					"😀".repeat(128),
					/Win32 255 UTF-16-code-unit limit \(256\)/,
				],
			])("rejects a component with %s before extraction", (_name, component, error) => {
				const { archivePath, directory } = createExtendedNameArchive(
					`package/dist/${component}`,
					format,
				);

				expectRejectedBeforeExtraction(archivePath, directory, error);
			});
		},
	);

	it.each([
		["without ambient tar options", {}],
		[
			"with hostile GNU literal quoting",
			{ TAR_OPTIONS: "--quoting-style=literal" },
		],
		[
			"with hostile bsdtar header transcoding",
			{ TAR_READER_OPTIONS: "hdrcharset=ISO-8859-1" },
		],
	])("rejects invalid UTF-8 archive member bytes %s before extraction", (_name, environment) => {
		const invalidName = Buffer.concat([
			Buffer.from("package/dist/invalid-", "utf8"),
			Buffer.from([0xff]),
			Buffer.from(".js", "utf8"),
		]);
		const { archivePath, directory } = createCraftedArchive([
			{ name: "package/", type: "directory" },
			{ name: "package/package.json", content: '{"name":"fixture"}\n' },
			{ name: invalidName, content: "unsafe\n" },
		]);

		withTarEnvironment(environment, () =>
			expectRejectedBeforeExtraction(
				archivePath,
				directory,
				/invalid UTF-8 entry name .*invalid-.*377\.js/,
			),
		);
	});

	it("removes ambient GNU tar path options from extraction", () => {
		const { archivePath, directory } = createArchive();

		expect(() =>
			withTarEnvironment(
				{ TAR_OPTIONS: "--strip-components=1" },
				() =>
					inspectPortablePackageArchive({
						archivePath,
						extractDirectory: join(directory, "extract"),
						packageName: "archive-contract-fixture",
					}),
			),
		).not.toThrow();
		expect(
			existsSync(join(directory, "extract", "package", "package.json")),
		).toBe(true);
	});

	it("preserves a leading UTF-8 BOM as archive member identity", () => {
		const bomPrefixedName = Buffer.concat([
			Buffer.from([0xef, 0xbb, 0xbf]),
			Buffer.from("package/package.json", "utf8"),
		]);
		const { archivePath, directory } = createCraftedArchive([
			{ name: bomPrefixedName, content: '{"name":"fixture"}\n' },
		]);

		expectRejectedBeforeExtraction(
			archivePath,
			directory,
			/non-portable entry/,
		);
	});

	it("preserves a literal backslash-octal name for Win32 rejection", () => {
		const { archivePath, directory } = createCraftedArchive([
			{ name: "package/", type: "directory" },
			{ name: "package/package.json", content: '{"name":"fixture"}\n' },
			{ name: "package/dist/literal\\037.js", content: "unsafe\n" },
		]);

		expectRejectedBeforeExtraction(
			archivePath,
			directory,
			/Win32-forbidden character .* \(U\+005C\).*literal\\\\037\.js/,
		);
	});

	it.each([
		["less-than", "bad<name.js", /Win32-forbidden character "<" \(U\+003C\)/],
		["greater-than", "bad>name.js", /Win32-forbidden character ">" \(U\+003E\)/],
		["colon", "bad:name.js", /Win32-forbidden character ":" \(U\+003A\)/],
		["double quote", 'bad"name.js', /Win32-forbidden character .* \(U\+0022\)/],
		["backslash", "bad\\name.js", /Win32-forbidden character .* \(U\+005C\)/],
		["pipe", "bad|name.js", /Win32-forbidden character .* \(U\+007C\)/],
		["question mark", "bad?name.js", /Win32-forbidden character .* \(U\+003F\)/],
		["asterisk", "bad*name.js", /Win32-forbidden character .* \(U\+002A\)/],
		["control character", "bad\u001fname.js", /Win32-forbidden character .* \(U\+001F\)/],
	])("rejects a Win32-forbidden %s in a component before extraction", (_name, component, error) => {
		const { archivePath, directory } = createCraftedArchive([
			{ name: "package/", type: "directory" },
			{ name: "package/package.json", content: '{"name":"fixture"}\n' },
			{ name: `package/dist/${component}`, content: "unsafe\n" },
		]);

		expectRejectedBeforeExtraction(archivePath, directory, error);
	});

	it.each([
		["bare device", "CON"],
		["case-insensitive device with extension", "con.txt"],
		["serial device with extension", "COM1.js"],
		["parallel device with extension", "LPT9.map"],
		["device basename padded before extension", "NUL .json"],
		["superscript serial device alias", "COM¹.js"],
		["superscript parallel device alias", "lpt³.asset"],
	])("rejects a reserved Win32 %s before extraction", (_name, component) => {
		const { archivePath, directory } = createCraftedArchive([
			{ name: "package/", type: "directory" },
			{ name: "package/package.json", content: '{"name":"fixture"}\n' },
			{ name: "package/dist/", type: "directory" },
			{ name: `package/dist/${component}/`, type: "directory" },
			{ name: `package/dist/${component}/asset.js`, content: "unsafe\n" },
		]);

		expectRejectedBeforeExtraction(
			archivePath,
			directory,
			/reserved Win32 device component/,
		);
	});

	it("accepts ordinary names that only begin like Win32 device names", () => {
		const { archivePath, directory } = createArchive({
			files: {
				"dist/console.js": "export {};\n",
				"dist/com10.js": "export {};\n",
				"dist/lpt0.js": "export {};\n",
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
