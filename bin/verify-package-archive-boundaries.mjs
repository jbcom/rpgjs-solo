import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	inspectPortablePackageArchive,
	listPublicPackageDirectories,
	packPackageArchive,
} from "./package-archive-contracts.mjs";

const rootDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const temporaryDirectory = mkdtempSync(
	join(tmpdir(), "rpgjs-package-archive-boundaries-"),
);

try {
	for (const packageDirectory of listPublicPackageDirectories(rootDirectory)) {
		const packageOutputDirectory = join(
			temporaryDirectory,
			basename(packageDirectory),
		);
		const { archivePath, manifest } = packPackageArchive({
			packageDirectory,
			destinationDirectory: packageOutputDirectory,
		});
		inspectPortablePackageArchive({
			archivePath,
			extractDirectory: join(packageOutputDirectory, "extract"),
			packageName: manifest.name,
		});
		console.log(`${manifest.name}@${manifest.version} archive boundary passed`);
	}
} finally {
	rmSync(temporaryDirectory, { recursive: true, force: true });
}
