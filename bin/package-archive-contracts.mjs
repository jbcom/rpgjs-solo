import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
} from "node:fs";
import { isAbsolute, join, win32 } from "node:path";

const dependencyFields = [
	"dependencies",
	"devDependencies",
	"optionalDependencies",
	"peerDependencies",
];
const importSpecifierPattern =
	/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/g;
const requireSpecifierPattern = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;
const referenceSpecifierPattern =
	/\/\/\/\s*<reference\s+(?:path|types)=["']([^"']+)["']/g;
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

const assertPortableImports = (directory, packageName) => {
	visitModules(directory, (path) => {
		const source = readFileSync(path, "utf8");
		for (const pattern of [
			importSpecifierPattern,
			requireSpecifierPattern,
			referenceSpecifierPattern,
		]) {
			for (const match of source.matchAll(pattern)) {
				const specifier = match[1];
				if (!isNonPortable(specifier)) continue;
				throw new Error(
					`${packageName} archive contains non-portable import ${specifier} in ${path}`,
				);
			}
		}
	});
};

const assertPortableEntries = (archivePath, packageName) => {
	const entries = execFileSync("tar", ["-tzf", archivePath], {
		encoding: "utf8",
		timeout: commandTimeoutMs,
		maxBuffer: commandMaxBuffer,
	})
		.split("\n")
		.filter(Boolean);
	for (const entry of entries) {
		if (
			!entry.startsWith("package/") ||
			entry.split("/").includes("..") ||
			entry.includes("node_modules/.pnpm/") ||
			isAbsolute(entry) ||
			win32.isAbsolute(entry)
		) {
			throw new Error(
				`${packageName} archive contains non-portable entry ${entry}`,
			);
		}
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
	mkdirSync(extractDirectory, { recursive: true });
	execFileSync("tar", ["-xzf", archivePath, "-C", extractDirectory], {
		stdio: "pipe",
		timeout: commandTimeoutMs,
		maxBuffer: commandMaxBuffer,
	});
	const packedDirectory = join(extractDirectory, "package");
	const packedManifest = readManifest(packedDirectory);
	assertPortableManifest(packedManifest);
	const distributionDirectory = join(packedDirectory, "dist");
	if (existsSync(distributionDirectory)) {
		assertPortableImports(distributionDirectory, packageName);
	}
	return { packedDirectory, packedManifest };
};
