import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
} from "node:fs";
import { isAbsolute, join, win32 } from "node:path";
import ts from "typescript";

const dependencyFields = [
	"dependencies",
	"devDependencies",
	"optionalDependencies",
	"peerDependencies",
];
const commandTimeoutMs = 300_000;
const commandMaxBuffer = 32 * 1024 * 1024;

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
	// ECMAScript case conversion is locale-independent. Uppercase followed by
	// lowercase conservatively folds expansions and contextual lowercase forms
	// that a lowercase-only key can leave distinct. Normalize both before and
	// after folding so canonically equivalent Unicode spellings share one key.
	entry.normalize("NFC").toUpperCase().toLowerCase().normalize("NFC");

const assertPortableEntries = (archivePath, packageName) => {
	const listArchive = (arguments_) =>
		execFileSync("tar", arguments_, {
			encoding: "utf8",
			timeout: commandTimeoutMs,
			maxBuffer: commandMaxBuffer,
		})
			.split("\n")
			.filter(Boolean);
	const entries = listArchive(["-tzf", archivePath]);
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
			entry.includes("\\") ||
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
		timeout: commandTimeoutMs,
		maxBuffer: commandMaxBuffer,
	});
	const packedDirectory = join(extractDirectory, "package");
	const packedManifest = readManifest(packedDirectory);
	assertPortableManifest(packedManifest);
	assertPortableImports(packedDirectory, packageName);
	return { packedDirectory, packedManifest };
};
