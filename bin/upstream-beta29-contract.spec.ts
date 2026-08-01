import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rootDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const upstreamCommit = "2fab01fb8e93ad13902b07db28935f058b387213";
const soloVersion = "5.0.0-beta.29.solo.0";

const readText = (path: string) =>
	readFileSync(join(rootDirectory, path), "utf8");
const readJson = (path: string) => JSON.parse(readText(path));

const inheritedVersions = new Map([
	["packages/action-battle/package.json", "5.0.0-beta.29"],
	["packages/chat/package.json", "5.0.0-beta.2"],
	["packages/client/package.json", "5.0.0-beta.29"],
	["packages/common/package.json", "5.0.0-beta.27"],
	["packages/server/package.json", "5.0.0-beta.29"],
	["packages/studio/package.json", "5.0.0-beta.31"],
	["packages/testing/package.json", "5.0.0-beta.29"],
	["packages/tiledmap/package.json", "5.0.0-beta.29"],
	["packages/ui-css/package.json", "5.0.0-beta.25"],
	["packages/vite/package.json", "5.0.0-beta.29"],
	["packages/vue/package.json", "5.0.0-beta.29"],
]);

const soloManifests = [
	"packages/solo/package.json",
	"packages/solo-action-battle/package.json",
	"packages/solo-renderer/package.json",
	"packages/solo-vite/package.json",
];

describe("RPGJS beta.29 adoption contract", () => {
	it("binds the exact upstream source and inherited release identities", () => {
		for (const [path, version] of inheritedVersions) {
			expect(readJson(path).version, path).toBe(version);
		}

		const upstreamLedger = readText("docs/upstream-sync.md");
		expect(upstreamLedger).toContain(upstreamCommit);
		expect(upstreamLedger).toMatch(
			/2fab01fb8e93ad13902b07db28935f058b387213[^\n]+Adopted by one upstream merge/,
		);
		const adr = readText("docs/internal/adr/005-solo-runtime.md");
		expect(adr).toContain(
			`Upstream baseline: \`RSamaium/RPG-JS:v5\` at \`${upstreamCommit}\``,
		);
	});

	it("coordinates all Solo source packages on the beta.29 identity", () => {
		for (const path of soloManifests) {
			expect(readJson(path).version, path).toBe(soloVersion);
		}

		const actionBattle = readJson("packages/solo-action-battle/package.json");
		const renderer = readJson("packages/solo-renderer/package.json");
		expect(actionBattle.dependencies["@jbcom/rpgjs-solo"]).toBe(
			`workspace:${soloVersion}`,
		);
		expect(renderer.dependencies["@jbcom/rpgjs-solo"]).toBe(
			`workspace:${soloVersion}`,
		);

		const playground = readJson("playground/games/solo/package.json");
		for (const name of [
			"@jbcom/rpgjs-solo",
			"@jbcom/rpgjs-solo-renderer",
			"@jbcom/rpgjs-solo-vite",
		]) {
			expect(playground.dependencies[name]).toBe(`workspace:${soloVersion}`);
		}

		expect(readText("packages/solo/README.md")).toContain(
			"RPGJS `5.0.0-beta.29`",
		);
		expect(
			existsSync(join(rootDirectory, ".changeset/solo-beta29-baseline.md")),
		).toBe(true);
		expect(
			existsSync(join(rootDirectory, ".changeset/solo-beta28-baseline.md")),
		).toBe(false);
	});

	it("retains the current fork toolchain and public API gate", () => {
		const rootManifest = readJson("package.json");
		expect(rootManifest.engines).toEqual({ node: ">=24 <25" });
		expect(rootManifest.packageManager).toBe("pnpm@11.18.0");
		expect(rootManifest.devDependencies.vite).toBe("8.2.0");
		expect(rootManifest.devDependencies.vitest).toBe("4.1.10");
		expect(rootManifest.scripts["test:types"]).toContain(
			"packages/action-battle/src/public-api-types.spec.ts",
		);
	});

	it("keeps inherited server tooling and all multiplayer authority out of Solo packages", () => {
		const inheritedVite = readJson("packages/vite/package.json");
		for (const field of [
			"dependencies",
			"optionalDependencies",
			"peerDependencies",
		]) {
			expect(inheritedVite[field]?.["@hono/vite-dev-server"]).toBeUndefined();
			expect(inheritedVite[field]?.["@hono/node-server"]).toBeUndefined();
		}

		const forbidden = [
			"@signe/room",
			"@signe/sync",
			"@hono/vite-dev-server",
			"@hono/node-server",
			"ws",
		];
		for (const path of soloManifests) {
			const manifest = readJson(path);
			for (const field of [
				"dependencies",
				"optionalDependencies",
				"peerDependencies",
			]) {
				for (const name of forbidden) {
					expect(
						manifest[field]?.[name],
						`${path}:${field}:${name}`,
					).toBeUndefined();
				}
			}
		}
	});
});
