import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rootDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const readJson = (path: string) =>
	JSON.parse(readFileSync(join(rootDirectory, path), "utf8"));

const expectedArchivedIds = [
	"blue-holes-flow",
	"brave-stable-foundations",
	"bright-readme-map",
	"calm-liquid-waves",
	"calm-maps-report-steps",
	"calm-studio-item-workflows",
	"canonical-module-api",
	"clean-package-type-builds",
	"clean-studio-hitbox-sync",
	"clean-workspace-internal-deps",
	"clear-mmorpg-save-guide",
	"fair-studio-atlas-sizes",
	"fierce-action-battle-impact",
	"fix-canvas-gui-visibility",
	"fix-ci-test-discovery",
	"fix-recursive-providers",
	"fix-studio-map-weather",
	"fresh-canvasengine-compatibility",
	"fresh-studio-map-config",
	"friendly-skill-projectiles",
	"fuzzy-terrain-streaming",
	"gentle-gui-chat-boundaries",
	"plain-studio-animations",
	"quick-studio-auto-start",
	"quiet-menu-hud-layout",
	"rare-maps-keep-database",
	"sharp-server-player-types",
	"sharp-studio-edge-repeat",
	"smart-action-battle-enemies",
	"smart-studio-string-templates",
	"soft-studio-media-scale",
	"stable-signe-boundary",
	"strong-rooms-deploy",
	"studio-hotbar-menu-settings",
	"tame-event-touch-plates",
	"tidy-tiled-vite-runtime",
	"trusted-studio-provider",
	"warm-input-forms",
	"wise-boss-ai-foundations",
];
const expectedArchiveSha256 =
	"9a7e5fdf00024a0bdd1f8033da9f607173f474e36cc6c78c953fc0ae10a806f6";

const changesetStateSha256 = () => {
	const changesetDirectory = join(rootDirectory, ".changeset");
	const files = [
		"pre.json",
		...readdirSync(changesetDirectory)
			.filter((name) => name.endsWith(".md"))
			.map((name) => name),
		...readdirSync(join(changesetDirectory, "pre"))
			.filter((name) => name.endsWith(".md"))
			.map((name) => `pre/${name}`),
	].sort();
	const hash = createHash("sha256");
	for (const file of files) {
		hash.update(file);
		hash.update("\0");
		hash.update(readFileSync(join(changesetDirectory, file)));
		hash.update("\0");
	}
	return hash.digest("hex");
};

describe("Changesets 3 repository migration", () => {
	it("uses the current v3 CLI and schema", () => {
		const manifest = readJson("package.json");
		expect(manifest.devDependencies["@changesets/cli"]).toBe("3.0.0");
		const config = readJson(".changeset/config.json");
		expect(config.$schema).toBe(
			"https://unpkg.com/@changesets/config@4.0.0/schema.json",
		);
	});

	it("commits the exact v2-to-v3 prerelease archive without duplicating pending state", () => {
		const preState = readJson(".changeset/pre.json");
		expect(preState).toEqual({ mode: "pre", tag: "beta" });

		const archivedIds = readdirSync(join(rootDirectory, ".changeset/pre"))
			.filter((name) => name.endsWith(".md"))
			.map((name) => name.slice(0, -3))
			.sort();
		expect(archivedIds).toEqual(expectedArchivedIds);
		const archiveHash = createHash("sha256");
		for (const id of archivedIds) {
			archiveHash.update(`${id}.md`);
			archiveHash.update("\0");
			archiveHash.update(
				readFileSync(join(rootDirectory, `.changeset/pre/${id}.md`)),
			);
			archiveHash.update("\0");
		}
		expect(archiveHash.digest("hex")).toBe(expectedArchiveSha256);

		const pendingIds = readdirSync(join(rootDirectory, ".changeset"))
			.filter(
				(name) =>
					name.endsWith(".md") && name !== "README.md",
			)
			.map((name) => name.slice(0, -3));
		expect(pendingIds).not.toEqual(expect.arrayContaining(expectedArchivedIds));
	});

	it("runs the real v3 status command without mutating prerelease state", () => {
		const outputDirectory = mkdtempSync(
			join(tmpdir(), "rpgjs-solo-changesets3-status-"),
		);
		const outputPath = join(outputDirectory, "status.json");
		const before = changesetStateSha256();

		try {
			const result = spawnSync(
				process.execPath,
				[
					join(rootDirectory, "node_modules/@changesets/cli/bin.js"),
					"status",
					"--output",
					outputPath,
				],
				{
					cwd: rootDirectory,
					encoding: "utf8",
					timeout: 30_000,
				},
			);
			expect(result.status, result.stderr || result.stdout).toBe(0);
			const plan = JSON.parse(readFileSync(outputPath, "utf8"));
			expect(plan.changesets).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ id: "tidy-solo-changesets-three" }),
				]),
			);
			expect(changesetStateSha256()).toBe(before);
		} finally {
			rmSync(outputDirectory, { recursive: true, force: true });
		}
	});
});
