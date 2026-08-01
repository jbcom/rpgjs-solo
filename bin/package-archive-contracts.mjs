import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
} from "node:fs";
import { isAbsolute, join, win32 } from "node:path";
import ts from "typescript";
import { caseFold } from "unicode-case-folding";

const dependencyFields = [
	"dependencies",
	"devDependencies",
	"optionalDependencies",
	"peerDependencies",
];
const commandTimeoutMs = 300_000;
const commandMaxBuffer = 32 * 1024 * 1024;

export const getDeterministicTarEnvironment = () => {
	const environment = Object.fromEntries(
		Object.entries(process.env).filter(([name]) => {
			const normalizedName = name.toUpperCase();
			return (
				normalizedName !== "TAR_OPTIONS" &&
				normalizedName !== "TAR_READER_OPTIONS" &&
				normalizedName !== "LC_ALL"
			);
		}),
	);
	// Both variables are implicitly parsed by their respective tar families and
	// can change listing bytes or extraction paths despite explicit CLI flags.
	// TAPE is harmless because every invocation supplies -f; writer-only options
	// do not affect this read/extract boundary. Filter names case-insensitively
	// because Windows child environments resolve them that way, then add exactly
	// one deterministic locale key so a mixed-case ambient alias cannot win.
	environment.LC_ALL = "C";
	return environment;
};

const readManifest = (directory) =>
	JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));

const visitModules = (directory, callback) => {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			visitModules(path, callback);
		} else if (/\.(?:[cm]?js|d\.[cm]?ts)$/.test(entry.name)) {
			callback(path);
		}
	}
};

const isNonPortable = (specifier) =>
	specifier.includes("node_modules/.pnpm/") ||
	specifier.includes("node_modules\\.pnpm\\") ||
	isAbsolute(specifier) ||
	win32.isAbsolute(specifier) ||
	specifier.startsWith("file:") ||
	specifier.startsWith("link:") ||
	specifier.startsWith("portal:") ||
	specifier.startsWith("workspace:");

const readStaticSpecifier = (node) =>
	ts.isStringLiteralLike(node) ? node.text : undefined;

const isStaticMemberAccess = (expression, isOwner, memberName) =>
	(
		ts.isPropertyAccessExpression(expression) &&
		isOwner(expression.expression) &&
		expression.name.text === memberName
	) ||
	(
		ts.isElementAccessExpression(expression) &&
		isOwner(expression.expression) &&
		readStaticSpecifier(expression.argumentExpression) === memberName
	);

const isIdentifierNamed = (node, name) =>
	ts.isIdentifier(node) && node.text === name;

const isImportMeta = (node) =>
	ts.isMetaProperty(node) &&
	node.keywordToken === ts.SyntaxKind.ImportKeyword;

const isRequireResolve = (expression) =>
	isStaticMemberAccess(
		expression,
		(owner) => isIdentifierNamed(owner, "require"),
		"resolve",
	);

const isModuleRequire = (expression) =>
	isStaticMemberAccess(
		expression,
		(owner) => isIdentifierNamed(owner, "module"),
		"require",
	);

const isImportMetaResolve = (expression) =>
	isStaticMemberAccess(expression, isImportMeta, "resolve");

const collectStaticModuleSpecifiers = (path, source) => {
	const scriptKind = /\.d\.[cm]?ts$/.test(path)
		? ts.ScriptKind.TS
		: ts.ScriptKind.JS;
	const sourceFile = ts.createSourceFile(
		path,
		source,
		ts.ScriptTarget.Latest,
		true,
		scriptKind,
	);
	const specifiers = [
		...sourceFile.referencedFiles.map((reference) => reference.fileName),
		...sourceFile.typeReferenceDirectives.map(
			(reference) => reference.fileName,
		),
	];
	const add = (node) => {
		const specifier = node && readStaticSpecifier(node);
		if (specifier !== undefined) specifiers.push(specifier);
	};
	const visit = (node) => {
		if (
			(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
			node.moduleSpecifier
		) {
			add(node.moduleSpecifier);
		} else if (
			ts.isImportEqualsDeclaration(node) &&
			ts.isExternalModuleReference(node.moduleReference)
		) {
			add(node.moduleReference.expression);
		} else if (ts.isImportTypeNode(node)) {
			if (ts.isLiteralTypeNode(node.argument)) add(node.argument.literal);
		} else if (ts.isCallExpression(node)) {
			const isStaticModuleCall =
				node.expression.kind === ts.SyntaxKind.ImportKeyword ||
				(ts.isIdentifier(node.expression) && node.expression.text === "require") ||
				isRequireResolve(node.expression) ||
				isModuleRequire(node.expression) ||
				isImportMetaResolve(node.expression);
			if (isStaticModuleCall) add(node.arguments[0]);
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return specifiers;
};

const assertPortableImports = (directory, packageName) => {
	visitModules(directory, (path) => {
		const source = readFileSync(path, "utf8");
		for (const specifier of collectStaticModuleSpecifiers(path, source)) {
			if (!isNonPortable(specifier)) continue;
			throw new Error(
				`${packageName} archive contains non-portable import ${specifier} in ${path}`,
			);
		}
	});
};

const getPortableArchiveMemberKey = (entry) =>
	// Unicode Default Case Folding is designed for caseless matching and covers
	// full fold mappings that chained ECMAScript case conversion misses, such as
	// capital sharp S (U+1E9E) and small sharp S (U+00DF). Normalize before and
	// after folding so canonically equivalent spellings share one portable key.
	caseFold(entry.normalize("NFC")).normalize("NFC");

const win32ForbiddenComponentCharacter = /[<>:"\\|?*\u0000-\u001f]/u;
const win32ReservedDeviceBase =
	/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])$/iu;

const assertPortableComponentLength = (component, entry, packageName) => {
	// JavaScript string length is the UTF-16 code-unit count used by Win32.
	// Count it separately from UTF-8 bytes so astral code points cannot bypass
	// the Windows component limit merely because there are fewer code points.
	const utf16CodeUnits = component.length;
	if (utf16CodeUnits > 255) {
		throw new Error(
			`${packageName} archive component ${JSON.stringify(component)} exceeds the Win32 255 UTF-16-code-unit limit (${utf16CodeUnits}) for ${entry}`,
		);
	}
	const utf8Bytes = Buffer.byteLength(component, "utf8");
	if (utf8Bytes > 255) {
		throw new Error(
			`${packageName} archive component ${JSON.stringify(component)} exceeds the common filesystem 255 UTF-8-byte limit (${utf8Bytes}) for ${entry}`,
		);
	}
};

const assertWin32PortableComponent = (component, entry, packageName) => {
	const forbiddenCharacter = component.match(
		win32ForbiddenComponentCharacter,
	)?.[0];
	if (forbiddenCharacter !== undefined) {
		const codePoint = forbiddenCharacter.codePointAt(0)
			.toString(16)
			.toUpperCase()
			.padStart(4, "0");
		throw new Error(
			`${packageName} archive contains Win32-forbidden character ${JSON.stringify(forbiddenCharacter)} (U+${codePoint}) in component ${JSON.stringify(component)} for ${entry}`,
		);
	}
	if (/[ .]$/u.test(component)) {
		throw new Error(
			`${packageName} archive contains Win32-trimmed trailing dot or space in component ${JSON.stringify(component)} for ${entry}`,
		);
	}
	// Win32 reserves device basenames even when an extension is present. Trim
	// spaces and dots immediately before that extension as a conservative guard
	// against aliases such as `CON .txt`; whole-component trailing dots/spaces
	// were rejected above. Windows also reserves the historical superscript
	// COM¹/COM²/COM³ and LPT¹/LPT²/LPT³ forms.
	const deviceBase = component
		.normalize("NFC")
		.split(".", 1)[0]
		.replace(/[ .]+$/u, "");
	if (win32ReservedDeviceBase.test(deviceBase)) {
		throw new Error(
			`${packageName} archive contains reserved Win32 device component ${JSON.stringify(component)} for ${entry}`,
		);
	}
};

const decodeTarListingEscapes = (entry, packageName) => {
	// Both bsdtar and GNU tar escape controls, literal backslashes, and (under a
	// C locale) UTF-8 bytes in listing output. Rebuild the original byte stream
	// before applying path contracts so `\\037` is a control byte, `\\\\037` is
	// a real backslash followed by digits, and octal UTF-8 still participates in
	// the existing NFC/case collision key.
	const pattern = /\\(?:([0-7]{3})|x([\da-f]{2})|([abfnrtv\\]))/giu;
	const parts = [];
	let cursor = 0;
	for (const match of entry.matchAll(pattern)) {
		parts.push(Buffer.from(entry.slice(cursor, match.index), "utf8"));
		const [, octal, hexadecimal, named] = match;
		if (octal !== undefined || hexadecimal !== undefined) {
			parts.push(
				Buffer.from([
					Number.parseInt(octal ?? hexadecimal, octal === undefined ? 16 : 8),
				]),
			);
		} else {
			parts.push(
				Buffer.from(
					{
						a: "\u0007",
						b: "\b",
						f: "\f",
						n: "\n",
						r: "\r",
						t: "\t",
						v: "\v",
						"\\": "\\",
					}[named.toLowerCase()],
					"utf8",
				),
			);
		}
		cursor = match.index + match[0].length;
	}
	parts.push(Buffer.from(entry.slice(cursor), "utf8"));
	try {
		return new TextDecoder("utf-8", {
			fatal: true,
			// Preserve a leading UTF-8 BOM as U+FEFF because it is part of an
			// archive member name, not a marker for a standalone text document.
			ignoreBOM: true,
		}).decode(
			Buffer.concat(parts),
		);
	} catch {
		throw new Error(
			`${packageName} archive contains invalid UTF-8 entry name ${JSON.stringify(entry)}`,
		);
	}
};

const assertPortableEntries = (archivePath, packageName) => {
	const listArchive = (arguments_, decodeEntries = false) =>
		execFileSync("tar", arguments_, {
			encoding: "utf8",
			env: getDeterministicTarEnvironment(),
			timeout: commandTimeoutMs,
			maxBuffer: commandMaxBuffer,
		})
			.split("\n")
			.filter(Boolean)
			.map((entry) =>
				decodeEntries
					? decodeTarListingEscapes(entry, packageName)
					: entry,
			);
	const entries = listArchive(["-tzf", archivePath], true);
	const verboseEntries = listArchive(["-tvzf", archivePath]);
	if (entries.length !== verboseEntries.length) {
		throw new Error(
			`${packageName} archive listing is ambiguous and cannot be extracted safely`,
		);
	}
	// Retain exact POSIX member identity while also rejecting aliases that common
	// case-insensitive or Unicode-normalizing consumer filesystems can collapse.
	const canonicalEntries = new Map();
	const portableEntries = new Map();
	for (const [index, entry] of entries.entries()) {
		const entryType = verboseEntries[index][0];
		const canonicalEntry =
			entryType === "d" && entry.endsWith("/") ? entry.slice(0, -1) : entry;
		const segments = canonicalEntry.split("/");
		const containsPnpmLayout = segments.some(
			(segment, segmentIndex) =>
				segment === "node_modules" && segments[segmentIndex + 1] === ".pnpm",
		);
		if (entryType !== "-" && entryType !== "d") {
			throw new Error(
				`${packageName} archive contains unsafe entry type ${entryType} for ${entry}`,
			);
		}
		if (
			segments.includes("") ||
			(canonicalEntry !== "package" &&
				!canonicalEntry.startsWith("package/")) ||
			(entryType !== "d" && canonicalEntry === "package") ||
			segments.includes("..") ||
			segments.includes(".") ||
			containsPnpmLayout ||
			isAbsolute(entry) ||
			win32.isAbsolute(entry)
		) {
			throw new Error(
				`${packageName} archive contains non-portable entry ${entry}`,
			);
		}
		for (const segment of segments) {
			assertPortableComponentLength(segment, entry, packageName);
			assertWin32PortableComponent(segment, entry, packageName);
		}
		const previousEntry = canonicalEntries.get(canonicalEntry);
		if (previousEntry !== undefined) {
			throw new Error(
				`${packageName} archive contains canonical member collision ${previousEntry} and ${entry}`,
			);
		}
		canonicalEntries.set(canonicalEntry, entry);
		const portableEntry = getPortableArchiveMemberKey(canonicalEntry);
		const previousPortableEntry = portableEntries.get(portableEntry);
		if (previousPortableEntry !== undefined) {
			throw new Error(
				`${packageName} archive contains portable member collision ${previousPortableEntry} and ${entry}`,
			);
		}
		portableEntries.set(portableEntry, entry);
	}
};

const assertPortableManifest = (manifest) => {
	for (const field of dependencyFields) {
		for (const [dependencyName, dependencyVersion] of Object.entries(
			manifest[field] ?? {},
		)) {
			if (
				typeof dependencyVersion === "string" &&
				(isNonPortable(dependencyVersion) ||
					dependencyVersion.startsWith("catalog:") ||
					dependencyVersion.startsWith("catalogs:") ||
					dependencyVersion.startsWith("./") ||
					dependencyVersion.startsWith("../"))
			) {
				throw new Error(
					`${manifest.name} archive retains local ${field} reference ${dependencyName}@${dependencyVersion}`,
				);
			}
		}
	}
};

export const listPublicPackageDirectories = (rootDirectory) => {
	const packagesDirectory = join(rootDirectory, "packages");
	return readdirSync(packagesDirectory, { withFileTypes: true })
		.filter(
			(entry) =>
				entry.isDirectory() &&
				existsSync(join(packagesDirectory, entry.name, "package.json")),
		)
		.map((entry) => join(packagesDirectory, entry.name))
		.filter((directory) => readManifest(directory).private !== true)
		.sort();
};

export const packPackageArchive = ({
	packageDirectory,
	destinationDirectory,
}) => {
	const manifest = readManifest(packageDirectory);
	mkdirSync(destinationDirectory, { recursive: true });
	execFileSync(
		"pnpm",
		["pack", "--pack-destination", destinationDirectory],
		{
			cwd: packageDirectory,
			stdio: "pipe",
			timeout: commandTimeoutMs,
			maxBuffer: commandMaxBuffer,
		},
	);
	const archives = readdirSync(destinationDirectory).filter((name) =>
		name.endsWith(".tgz"),
	);
	if (archives.length !== 1) {
		throw new Error(
			`Expected one packed archive for ${manifest.name}, received ${archives.length}`,
		);
	}
	return {
		archivePath: join(destinationDirectory, archives[0]),
		manifest,
	};
};

export const inspectPortablePackageArchive = ({
	archivePath,
	extractDirectory,
	packageName,
}) => {
	assertPortableEntries(archivePath, packageName);
	if (existsSync(extractDirectory)) {
		throw new Error(
			`${packageName} archive requires a fresh extraction directory`,
		);
	}
	mkdirSync(extractDirectory, { recursive: true });
	execFileSync("tar", ["-xzf", archivePath, "-C", extractDirectory], {
		stdio: "pipe",
		env: getDeterministicTarEnvironment(),
		timeout: commandTimeoutMs,
		maxBuffer: commandMaxBuffer,
	});
	const packedDirectory = join(extractDirectory, "package");
	const packedManifest = readManifest(packedDirectory);
	assertPortableManifest(packedManifest);
	assertPortableImports(packedDirectory, packageName);
	return { packedDirectory, packedManifest };
};
