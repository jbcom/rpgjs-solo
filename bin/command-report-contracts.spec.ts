import { describe, expect, it } from "vitest";
import {
	parseNpmAuditReport,
	parsePnpmOutdatedReport,
} from "./command-report-contracts.mjs";

const commandResult = (
	stdout: unknown,
	options: { status?: number; signal?: string | null; stderr?: string } = {},
) => ({
	status: options.status ?? 0,
	signal: options.signal ?? null,
	stderr: options.stderr ?? "",
	stdout: typeof stdout === "string" ? stdout : JSON.stringify(stdout),
});

describe("external command report contracts", () => {
	it("accepts only a successful, schema-valid zero-vulnerability audit", () => {
		expect(
			parseNpmAuditReport(
				commandResult({ metadata: { vulnerabilities: { total: 0 } } }),
			),
		).toMatchObject({ metadata: { vulnerabilities: { total: 0 } } });

		expect(() =>
			parseNpmAuditReport(
				commandResult(
					{ error: { code: "ENOLOCK", summary: "missing lockfile" } },
					{ status: 1 },
				),
			),
		).toThrow(/failed operationally.*ENOLOCK/i);
		expect(() => parseNpmAuditReport(commandResult({}, { status: 1 }))).toThrow(
			/metadata\.vulnerabilities\.total/i,
		);
		expect(() =>
			parseNpmAuditReport(
				commandResult(
					{ metadata: { vulnerabilities: { total: 0 } } },
					{ status: 1 },
				),
			),
		).toThrow(/failed operationally despite reporting zero/i);
	});

	it("reports vulnerabilities without misclassifying them as an operational failure", () => {
		expect(() =>
			parseNpmAuditReport(
				commandResult(
					{ metadata: { vulnerabilities: { total: 2 } } },
					{ status: 1 },
				),
			),
		).toThrow(/found 2 vulnerabilities/i);
	});

	it("accepts complete pnpm outdated reports and rejects operational ambiguity", () => {
		const report = {
			vite: {
				current: "8.2.0",
				wanted: "8.2.0",
				latest: "9.0.0",
			},
		};
		expect(
			parsePnpmOutdatedReport(commandResult(report, { status: 1 })),
		).toEqual(report);
		expect(parsePnpmOutdatedReport(commandResult({}, { status: 0 }))).toEqual(
			{},
		);

		expect(() =>
			parsePnpmOutdatedReport(
				commandResult(report, {
					status: 1,
					stderr: "ERR_PNPM_META_FETCH_FAIL registry unavailable",
				}),
			),
		).toThrow(/failed operationally.*META_FETCH_FAIL/i);
		expect(() =>
			parsePnpmOutdatedReport(commandResult({}, { status: 1 })),
		).toThrow(/exit 1 without any outdated/i);
		expect(() =>
			parsePnpmOutdatedReport(
				commandResult(
					{ vite: { current: "8.2.0", latest: "9.0.0" } },
					{ status: 1 },
				),
			),
		).toThrow(/incomplete entry for vite/i);
	});
});
