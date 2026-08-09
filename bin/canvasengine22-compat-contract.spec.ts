import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rootDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const readSource = (path: string) =>
	readFileSync(join(rootDirectory, path), "utf8");

describe("CanvasEngine 2.2 source compatibility", () => {
	it("keeps compiler-private metadata behind Vite's public Plugin boundary", () => {
		const source = readSource("packages/vite/src/rpgjs-plugin.ts");

		expect(source).toContain('import type { Plugin } from "vite";');
		expect(source).toMatch(/}: RpgjsPluginOptions\): Plugin\[\]/);
		expect(source).not.toContain("CompileMetadata");
	});

	it("keeps quote-bearing ObjectId patterns legible to the SFC block scanner", () => {
		const source = readSource("packages/studio/src/components/draw-map-v2.ce");

		expect(source).toContain(
			"result.match(new RegExp('^ObjectId\\\\(\"([^\"]+)\"\\\\)$'))",
		);
		expect(source).toContain(
			'result.match(new RegExp("^ObjectId\\\\(\'([^\']+)\'\\\\)$"))',
		);
		expect(source).not.toMatch(/result\.match\(\/\^ObjectId/);
	});
});
