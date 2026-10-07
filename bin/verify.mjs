#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const verificationGates = [
	["verify:toolchain-currency"],
	["verify:upstream-beta30-disposition"],
	["audit", "--audit-level=low"],
	["build"],
	["api:boundary"],
	["test:types"],
	["verify:solo-boundary"],
	["verify:package-archive-boundaries"],
	["verify:solo-package-contracts"],
	["verify:solo-consumer"],
	["verify:published-package-contracts"],
	["test", "--run"],
	["--dir", "samples/cloudflare-mmorpg", "test"],
	["--dir", "playground/games/studio", "test"],
	["--filter", "@rpgjs/playground-*", "--filter", "sample", "run", "build"],
];

/** Run all existing gates and preserve every failure in the aggregate result. */
export const runVerificationGates = (command = spawnSync, log = console.log) => {
	const results = verificationGates.map((args) => {
		log(`Verifying: pnpm ${args.join(" ")}`);
		const result = command("pnpm", args, { stdio: "inherit" });
		return {
			command: `pnpm ${args.join(" ")}`,
			exitCode: result.status ?? 1,
		};
	});
	for (const result of results)
		log(`${result.exitCode === 0 ? "PASS" : "FAIL"}: ${result.command}`);
	return { results, exitCode: results.some(({ exitCode }) => exitCode !== 0) ? 1 : 0 };
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
	process.exitCode = runVerificationGates().exitCode;
