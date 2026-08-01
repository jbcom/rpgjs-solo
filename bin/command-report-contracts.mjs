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

const parsePnpmOutdatedJson = (stdout) => {
	const output = reportText(stdout);
	const jsonStart = output.indexOf("{");
	if (jsonStart < 0) return parseJsonReport("pnpm outdated", output);
	const prefix = output.slice(0, jsonStart).trim();
	if (prefix) {
		const allowedSlowRequest =
			/^\[WARN\] Request took [1-9][0-9]*ms: https:\/\/registry\.npmjs\.org\/\S+$/;
		for (const line of prefix.split(/\r?\n/)) {
			if (!allowedSlowRequest.test(line)) {
				throw new Error(
					`pnpm outdated returned unexpected stdout before its JSON report: ${line}`,
				);
			}
		}
	}
	return parseJsonReport("pnpm outdated", output.slice(jsonStart));
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
	if (audit.auditReportVersion !== 2) {
		throw new Error(
			`npm audit returned unsupported auditReportVersion ${String(audit.auditReportVersion)}`,
		);
	}
	if (
		!audit.vulnerabilities ||
		typeof audit.vulnerabilities !== "object" ||
		Array.isArray(audit.vulnerabilities)
	) {
		throw new Error(
			"npm audit returned no valid top-level vulnerabilities map",
		);
	}
	const severityNames = ["info", "low", "moderate", "high", "critical"];
	const severityCounts = audit.metadata?.vulnerabilities;
	if (!severityCounts || typeof severityCounts !== "object") {
		throw new Error(
			"npm audit returned no valid metadata.vulnerabilities counts",
		);
	}
	for (const severity of [...severityNames, "total"]) {
		if (
			!Number.isSafeInteger(severityCounts[severity]) ||
			severityCounts[severity] < 0
		) {
			throw new Error(
				`npm audit returned an invalid metadata.vulnerabilities.${severity} count`,
			);
		}
	}
	const severityTotal = severityNames.reduce(
		(sum, severity) => sum + severityCounts[severity],
		0,
	);
	if (severityCounts.total !== severityTotal) {
		throw new Error(
			`npm audit vulnerability severity counts sum to ${severityTotal}, not total ${severityCounts.total}`,
		);
	}
	const vulnerabilityEntries = Object.entries(audit.vulnerabilities);
	if (vulnerabilityEntries.length !== severityCounts.total) {
		throw new Error(
			`npm audit vulnerability map has ${vulnerabilityEntries.length} entries, not total ${severityCounts.total}`,
		);
	}
	const countedSeverities = Object.fromEntries(
		severityNames.map((severity) => [severity, 0]),
	);
	for (const [packageName, vulnerability] of vulnerabilityEntries) {
		if (
			!vulnerability ||
			typeof vulnerability !== "object" ||
			Array.isArray(vulnerability) ||
			vulnerability.name !== packageName ||
			!severityNames.includes(vulnerability.severity) ||
			typeof vulnerability.isDirect !== "boolean" ||
			!Array.isArray(vulnerability.via) ||
			vulnerability.via.length === 0 ||
			!Array.isArray(vulnerability.effects) ||
			typeof vulnerability.range !== "string" ||
			!Array.isArray(vulnerability.nodes) ||
			!vulnerability.nodes.every((node) => typeof node === "string") ||
			!(
				typeof vulnerability.fixAvailable === "boolean" ||
				(vulnerability.fixAvailable &&
					typeof vulnerability.fixAvailable === "object" &&
					!Array.isArray(vulnerability.fixAvailable))
			)
		) {
			throw new Error(
				`npm audit returned an incomplete vulnerability entry for ${packageName}`,
			);
		}
		countedSeverities[vulnerability.severity] += 1;
	}
	for (const severity of severityNames) {
		if (countedSeverities[severity] !== severityCounts[severity]) {
			throw new Error(
				`npm audit ${severity} vulnerability entries do not match metadata count`,
			);
		}
	}
	const total = severityCounts.total;
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
	const outdated = parsePnpmOutdatedJson(result.stdout);
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

export const parsePnpmWorkspaceProjects = (result) => {
	if (
		result.status !== 0 ||
		result.signal ||
		result.error ||
		reportText(result.stderr).trim()
	) {
		throw new Error(
			`pnpm recursive list failed operationally: ${describeFailure(result)}`,
		);
	}
	const projects = parseJsonReport("pnpm recursive list", result.stdout);
	if (!Array.isArray(projects) || projects.length === 0) {
		throw new Error("pnpm recursive list returned no workspace projects");
	}
	const paths = new Set();
	for (const [index, project] of projects.entries()) {
		if (
			!project ||
			typeof project !== "object" ||
			Array.isArray(project) ||
			typeof project.name !== "string" ||
			project.name.length === 0 ||
			typeof project.path !== "string" ||
			project.path.length === 0
		) {
			throw new Error(
				`pnpm recursive list returned an incomplete project at index ${index}`,
			);
		}
		if (paths.has(project.path)) {
			throw new Error(
				`pnpm recursive list returned duplicate project path ${project.path}`,
			);
		}
		paths.add(project.path);
	}
	return projects;
};

export const parsePnpmLockImporterIds = (lockfile) => {
	const importerIds = [];
	let inImporters = false;
	for (const line of reportText(lockfile).split(/\r?\n/)) {
		if (line === "importers:") {
			inImporters = true;
			continue;
		}
		if (!inImporters) continue;
		if (/^[^\s]/.test(line)) break;
		const match = /^ {2}([^\s].*):$/.exec(line);
		if (!match) continue;
		const importerId = match[1].replace(/^(['"])(.*)\1$/, "$2");
		if (importerIds.includes(importerId)) {
			throw new Error(
				`pnpm lockfile contains duplicate importer ${importerId}`,
			);
		}
		importerIds.push(importerId);
	}
	if (importerIds.length === 0) {
		throw new Error("pnpm lockfile contains no importers");
	}
	return importerIds;
};

export const collectPnpmOutdatedRows = (projectReports) =>
	projectReports.flatMap(({ importerId, report }) =>
		Object.entries(report).map(([packageName, detail]) => ({
			importerId,
			packageName,
			detail,
		})),
	);

const semanticMajor = (version) => {
	const match = /^(\d+)\./.exec(version);
	if (!match) throw new Error(`Cannot read semantic major from ${version}`);
	return Number(match[1]);
};

export const classifyPnpmOutdatedRows = (rows, intentionalMajorBoundaries) => {
	const unresolved = [];
	const accepted = [];
	for (const { importerId, packageName, detail } of rows) {
		const coordinate = `${importerId} -> ${packageName}`;
		const boundary = intentionalMajorBoundaries.get(packageName);
		if (!boundary) {
			unresolved.push(`${coordinate}: ${detail.current} -> ${detail.latest}`);
			continue;
		}
		const [expectedCurrentMajor, expectedLatestMajor, reason] = boundary;
		if (
			semanticMajor(detail.current) !== expectedCurrentMajor ||
			semanticMajor(detail.latest) !== expectedLatestMajor
		) {
			unresolved.push(
				`${coordinate}: expected ${expectedCurrentMajor}.x -> ${expectedLatestMajor}.x boundary, received ${detail.current} -> ${detail.latest}`,
			);
			continue;
		}
		if (detail.current !== detail.wanted) {
			unresolved.push(
				`${coordinate}: compatible update remains (${detail.current} installed, ${detail.wanted} wanted)`,
			);
			continue;
		}
		accepted.push({
			importerId,
			packageName,
			current: detail.current,
			latest: detail.latest,
			expectedCurrentMajor,
			reason,
		});
	}
	return { unresolved, accepted };
};
