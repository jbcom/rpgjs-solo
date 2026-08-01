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

interface AuditVulnerabilityFixture {
	name: string;
	severity: string;
	isDirect: boolean;
	via: string[];
	effects: string[];
	range: string;
	nodes: string[];
	fixAvailable: boolean;
}

interface AuditReportFixture {
	auditReportVersion: number;
	vulnerabilities: Record<string, AuditVulnerabilityFixture>;
	metadata: {
		vulnerabilities: {
			info: number;
			low: number;
			moderate: number;
			high: number;
			critical: number;
			total: number;
		};
	};
}

const zeroAuditReport = (): AuditReportFixture => ({
	auditReportVersion: 2,
	vulnerabilities: {},
	metadata: {
		vulnerabilities: {
			info: 0,
			low: 0,
			moderate: 0,
			high: 0,
			critical: 0,
			total: 0,
		},
	},
});

describe("external command report contracts", () => {
	it("accepts only a successful, schema-valid zero-vulnerability audit", () => {
		expect(parseNpmAuditReport(commandResult(zeroAuditReport()))).toMatchObject(
			{
				auditReportVersion: 2,
				vulnerabilities: {},
				metadata: { vulnerabilities: { total: 0 } },
			},
		);

		expect(() =>
			parseNpmAuditReport(
				commandResult(
					{ error: { code: "ENOLOCK", summary: "missing lockfile" } },
					{ status: 1 },
				),
			),
		).toThrow(/failed operationally.*ENOLOCK/i);
		expect(() => parseNpmAuditReport(commandResult({}, { status: 1 }))).toThrow(
			/auditReportVersion/i,
		);
		expect(() =>
			parseNpmAuditReport(commandResult(zeroAuditReport(), { status: 1 })),
		).toThrow(/failed operationally despite reporting zero/i);
	});

	it("rejects truncated and internally inconsistent npm audit v2 reports", () => {
		expect(() =>
			parseNpmAuditReport(
				commandResult({
					auditReportVersion: 2,
					metadata: { vulnerabilities: { total: 0 } },
				}),
			),
		).toThrow(/top-level vulnerabilities map/i);

		const missingSeverityCounts = zeroAuditReport();
		delete (missingSeverityCounts.metadata.vulnerabilities as { low?: number })
			.low;
		expect(() =>
			parseNpmAuditReport(commandResult(missingSeverityCounts)),
		).toThrow(/invalid metadata\.vulnerabilities\.low/i);

		const inconsistentTotal = zeroAuditReport();
		inconsistentTotal.metadata.vulnerabilities.total = 1;
		expect(() => parseNpmAuditReport(commandResult(inconsistentTotal))).toThrow(
			/severity counts sum to 0, not total 1/i,
		);

		const unexpectedEntry = zeroAuditReport();
		unexpectedEntry.vulnerabilities = {
			lodash: {
				name: "lodash",
				severity: "high",
				isDirect: true,
				via: ["advisory"],
				effects: [],
				range: "<4.17.21",
				nodes: ["node_modules/lodash"],
				fixAvailable: true,
			},
		};
		expect(() => parseNpmAuditReport(commandResult(unexpectedEntry))).toThrow(
			/vulnerability map has 1 entries, not total 0/i,
		);
	});

	it("reports vulnerabilities without misclassifying them as an operational failure", () => {
		const vulnerableAudit = zeroAuditReport();
		vulnerableAudit.vulnerabilities = {
			lodash: {
				name: "lodash",
				severity: "high",
				isDirect: true,
				via: ["advisory"],
				effects: [],
				range: "<4.17.21",
				nodes: ["node_modules/lodash"],
				fixAvailable: true,
			},
		};
		vulnerableAudit.metadata.vulnerabilities.high = 1;
		vulnerableAudit.metadata.vulnerabilities.total = 1;
		expect(() =>
			parseNpmAuditReport(commandResult(vulnerableAudit, { status: 1 })),
		).toThrow(/found 1 vulnerabilities/i);
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
		expect(
			parsePnpmOutdatedReport(
				commandResult(
					`[WARN] Request took 12001ms: https://registry.npmjs.org/vite\n${JSON.stringify(report)}`,
					{ status: 1 },
				),
			),
		).toEqual(report);

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
		expect(() =>
			parsePnpmOutdatedReport(
				commandResult(
					`[WARN] Registry returned a partial response\n${JSON.stringify(report)}`,
					{ status: 1 },
				),
			),
		).toThrow(/unexpected stdout before.*partial response/i);
		expect(() =>
			parsePnpmOutdatedReport(
				commandResult(
					`[WARN] Request took 12001ms: https://example.test/vite\n${JSON.stringify(report)}`,
					{ status: 1 },
				),
			),
		).toThrow(/unexpected stdout before.*example\.test/i);
	});
});
