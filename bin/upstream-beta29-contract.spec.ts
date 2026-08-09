import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rootDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const upstreamCommit = "2fab01fb8e93ad13902b07db28935f058b387213";

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
const releasePlan = readJson(
	"docs/internal/releases/solo-beta29-solo2.plan.json",
);

const currentSoloPhase = () => {
	const versions = new Set(
		soloManifests.map((path) => readJson(path).version as string),
	);
	expect([...versions], "Solo cohort must have one release identity").toHaveLength(
		1,
	);
	const version = [...versions][0];
	expect([releasePlan.previousVersion, releasePlan.version]).toContain(version);
	return {
		version,
		phase: version === releasePlan.version ? "applied" : "source",
	};
};

describe("RPGJS beta.29 adoption contract", () => {
	it("binds the exact upstream source and inherited release identities", () => {
		for (const [path, version] of inheritedVersions) {
			expect(readJson(path).version, path).toBe(version);
		}

		const upstreamLedger = readText("docs/upstream-sync.md");
		expect(upstreamLedger).toContain(upstreamCommit);
		const adr = readText("docs/internal/adr/005-solo-runtime.md");
		expect(adr).toContain(
			`Upstream baseline: \`RSamaium/RPG-JS:v5\` at \`${upstreamCommit}\``,
		);
	});

	it("coordinates all Solo source packages on the beta.29 identity", () => {
		const { version: soloVersion, phase } = currentSoloPhase();
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
			expect(
				playground.dependencies[name] ?? playground.devDependencies[name],
			).toBe(`workspace:${soloVersion}`);
		}
		expect(playground.dependencies["@rpgjs/ui-css"]).toBe(
			"workspace:5.0.0-beta.25",
		);

		expect(readText("packages/solo/README.md")).toContain(
			"RPGJS `5.0.0-beta.29`",
		);
		for (const { id } of releasePlan.consumedChangesets) {
			expect(
				existsSync(join(rootDirectory, `.changeset/${id}.md`)),
				id,
			).toBe(phase === "source");
		}
		for (const { id } of releasePlan.carriedChangesets) {
			expect(
				existsSync(join(rootDirectory, `.changeset/${id}.md`)),
				id,
			).toBe(true);
		}
		expect(
			existsSync(join(rootDirectory, ".changeset/solo-beta29-baseline.md")),
		).toBe(false);
		expect(
			existsSync(join(rootDirectory, ".changeset/solo-beta28-baseline.md")),
		).toBe(false);
	});

	it("retains the current fork toolchain and public API gate", () => {
		const rootManifest = readJson("package.json");
		const cloudflareManifest = readJson(
			"samples/cloudflare-mmorpg/package.json",
		);
		const workspacePolicy = readText("pnpm-workspace.yaml");
		const lockfile = readText("pnpm-lock.yaml");
		expect(rootManifest.engines).toEqual({ node: ">=24 <25" });
		expect(rootManifest.packageManager).toBe("pnpm@11.21.0");
		expect(rootManifest.devDependencies.vite).toBe("8.2.1");
		expect(rootManifest.devDependencies.canvasengine).toBe("2.2.0");
		expect(rootManifest.devDependencies["@canvasengine/compiler"]).toBe(
			"2.2.0",
		);
		expect(rootManifest.devDependencies["@canvasengine/presets"]).toBe(
			"2.2.0",
		);
		expect(rootManifest.devDependencies.vitest).toBe("4.1.10");
		expect(cloudflareManifest.devDependencies.esbuild).toBe("0.28.2");
		expect(workspacePolicy).toContain("  esbuild: 0.28.2");
		expect(workspacePolicy).toContain("  'partykit>esbuild': 0.28.2");
		expect(lockfile).toContain("  esbuild@0.28.2:");
		expect(lockfile).not.toMatch(/(?:^|\s)esbuild@0\.28\.1(?:\s|:|\))/m);
		const soloRenderer = readJson("packages/solo-renderer/package.json");
		expect(soloRenderer.dependencies).toMatchObject({
			"@canvasengine/presets": "2.2.0",
			"@canvasengine/tiled": "2.2.0",
			canvasengine: "2.2.0",
		});
		expect(readJson("packages/solo-vite/package.json").peerDependencies.vite).toBe(
			"8.2.1",
		);
		expect(rootManifest.scripts["test:types"]).toContain(
			"packages/action-battle/src/public-api-types.spec.ts",
		);
		for (const npmLauncher of [
			"bin/common.ts",
			"bin/tag-latest.ts",
			"bin/verify-published-package-contracts.mjs",
		]) {
			const source = readText(npmLauncher);
			expect(source, npmLauncher).toContain("npmChildEnvironment");
			expect(source, npmLauncher).toContain("env: npmEnvironment");
			if (npmLauncher.endsWith(".ts")) {
				expect(source, npmLauncher).toContain("extendEnv: false");
			}
		}
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
