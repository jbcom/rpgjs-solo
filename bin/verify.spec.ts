import { describe, expect, it } from "vitest";
import { runVerificationGates, verificationGates } from "./verify.mjs";

describe("aggregate verification", () => {
	it("runs every gate after an early failure and fails the aggregate", () => {
		const calls: string[][] = [];
		const result = runVerificationGates((_program: string, args: string[]) => {
			calls.push(args);
			return { status: calls.length === 1 ? 1 : 0 };
		}, () => {});
		expect(calls).toEqual(verificationGates);
		expect(result.exitCode).toBe(1);
		expect(result.results.at(-1)?.exitCode).toBe(0);
	});

	it("fails closed when a child cannot start", () => {
		expect(runVerificationGates(() => ({ status: null }), () => {}).exitCode).toBe(1);
	});

	it("passes only when every gate passes", () => {
		expect(runVerificationGates(() => ({ status: 0 }), () => {}).exitCode).toBe(0);
	});
});
