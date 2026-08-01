import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";

const rootDirectory = dirname(dirname(fileURLToPath(import.meta.url)));

const readWorkflow = (path: string) => {
	const source = readFileSync(join(rootDirectory, path), "utf8");
	const document = parseDocument(source, { uniqueKeys: true });
	if (document.errors.length > 0 || document.warnings.length > 0) {
		throw new Error(
			`${path} is not strict YAML: ${[...document.errors, ...document.warnings]
				.map((entry) => entry.message)
				.join("; ")}`,
		);
	}
	return { source, workflow: document.toJS() };
};

describe("fork-owned CI boundary", () => {
	it("runs the complete Node 24 product lane without publication authority", () => {
		const { source, workflow } = readWorkflow(".github/workflows/fork-ci.yml");
		expect(workflow.name).toBe("Fork CI");
		expect(workflow.permissions).toEqual({ contents: "read" });
		expect(workflow.on.push.branches).toEqual(["main"]);
		expect(workflow.on.pull_request.branches).toEqual(["*"]);

		const job = workflow.jobs.tests;
		expect(job["timeout-minutes"]).toBe(30);
		expect(job.strategy.matrix["node-version"]).toEqual([24]);
		for (const step of job.steps) {
			if (step.uses) {
				expect(step.uses).toMatch(/^[^@]+@[0-9a-f]{40}$/);
			}
		}
		for (const requiredStep of [
			"Dependency currency",
			"Workspace dependency audit",
			"Build",
			"Public API boundary",
			"Public API type contracts",
			"Solo production boundary",
			"Solo packed package contracts",
			"Solo packed consumer execution",
			"Published package dependency contracts",
			"Unit tests",
			"Cloudflare MMORPG runtime tests",
			"Cloudflare Studio runtime tests",
			"Playground and sample builds",
		]) {
			expect(
				job.steps.some((step: { name?: string }) => step.name === requiredStep),
			).toBe(true);
		}

		expect(source).not.toMatch(
			/changesets\/action|publish-packages|npm publish|pnpm publish/i,
		);
		expect(Object.keys(workflow.jobs)).toEqual(["tests"]);
	});

	it("checks out and proves a required exact SHA for manual tracking validation", () => {
		const { source, workflow } = readWorkflow(".github/workflows/fork-ci.yml");
		const input = workflow.on.workflow_dispatch.inputs.commit;
		expect(input.required).toBe(true);
		expect(input.type).toBe("string");
		expect(input.description).toMatch(/40-character/i);

		const checkout = workflow.jobs.tests.steps.find(
			(step: { uses?: string }) => step.uses?.startsWith("actions/checkout@"),
		);
		expect(checkout.with.ref).toContain("inputs.commit");
		expect(checkout.with["persist-credentials"]).toBe(false);
		const stepNames = workflow.jobs.tests.steps.map(
			(step: { name?: string }) => step.name,
		);
		expect(stepNames.indexOf("Prove requested tracking commit")).toBeLessThan(
			stepNames.indexOf("Install dependencies"),
		);
		expect(source).toContain("git rev-parse HEAD");
		expect(source).toContain("REQUESTED_COMMIT");
		expect(source).toContain("^[0-9a-f]{40}$");
		expect(source).toContain("refs/remotes/origin/v5");
		expect(source).toContain("refs/remotes/upstream/v5");
		expect(source).toContain("https://github.com/RSamaium/RPG-JS.git");
	});
});
