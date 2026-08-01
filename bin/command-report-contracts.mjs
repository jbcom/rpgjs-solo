const reportText = (value) =>
	typeof value === "string" ? value : (value?.toString() ?? "");

const describeFailure = ({ status, signal, stderr, error }) => {
	const details = [];
	if (status !== undefined && status !== null) details.push(`exit ${status}`);
	if (signal) details.push(`signal ${signal}`);
	if (error) details.push(`error: ${error.message ?? String(error)}`);
	const stderrText = reportText(stderr).trim();
	if (stderrText) details.push(`stderr: ${stderrText}`);
	return details.join(", ") || "unknown command failure";
};

const parseJsonReport = (commandName, stdout) => {
	const output = reportText(stdout);
	if (!output.trim()) {
		throw new Error(`${commandName} returned no JSON report`);
	}
	try {
		return JSON.parse(output);
	} catch (error) {
		throw new Error(
			`${commandName} returned malformed JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
};

export const parseNpmAuditReport = (result) => {
	const audit = parseJsonReport("npm audit", result.stdout);
	if (!audit || typeof audit !== "object" || Array.isArray(audit)) {
		throw new Error("npm audit returned a non-object JSON report");
	}
	if (audit.error) {
		throw new Error(
			`npm audit failed operationally: ${JSON.stringify(audit.error)}`,
		);
	}
	const total = audit.metadata?.vulnerabilities?.total;
	if (!Number.isSafeInteger(total) || total < 0) {
		throw new Error(
			"npm audit returned no valid metadata.vulnerabilities.total field",
		);
	}
	if (total !== 0) {
		throw new Error(
			`External @rpgjs/vite consumer audit found ${String(total)} vulnerabilities`,
		);
	}
	if (
		result.status !== 0 ||
		result.signal ||
		result.error ||
		reportText(result.stderr).trim()
	) {
		throw new Error(
			`npm audit failed operationally despite reporting zero vulnerabilities: ${describeFailure(result)}`,
		);
	}
	return audit;
};

export const parsePnpmOutdatedReport = (result) => {
	if (
		(result.status !== 0 && result.status !== 1) ||
		result.signal ||
		result.error ||
		reportText(result.stderr).trim()
	) {
		throw new Error(
			`pnpm outdated failed operationally: ${describeFailure(result)}`,
		);
	}
	const outdated = parseJsonReport("pnpm outdated", result.stdout);
	if (!outdated || typeof outdated !== "object" || Array.isArray(outdated)) {
		throw new Error("pnpm outdated returned a non-object JSON report");
	}
	if (outdated.error) {
		throw new Error(
			`pnpm outdated failed operationally: ${JSON.stringify(outdated.error)}`,
		);
	}
	const entries = Object.entries(outdated);
	for (const [packageName, detail] of entries) {
		if (
			!detail ||
			typeof detail !== "object" ||
			Array.isArray(detail) ||
			![detail.current, detail.wanted, detail.latest].every(
				(version) => typeof version === "string" && version.length > 0,
			)
		) {
			throw new Error(
				`pnpm outdated returned an incomplete entry for ${packageName}`,
			);
		}
	}
	if (result.status === 0 && entries.length !== 0) {
		throw new Error(
			"pnpm outdated reported dependency updates with a successful exit status",
		);
	}
	if (result.status === 1 && entries.length === 0) {
		throw new Error(
			"pnpm outdated returned exit 1 without any outdated dependency entries",
		);
	}
	return outdated;
};
