import { describe, expect, test } from "vitest";
import { ClientInputLockManager } from "./inputLock";

describe("ClientInputLockManager", () => {
	test("keeps input locked until every independent owner releases", () => {
		const manager = new ClientInputLockManager();
		const releaseTargeting = manager.acquire({ source: "targeting" });
		const releaseMenu = manager.acquire({ source: "menu" });

		expect(manager.active).toBe(true);
		releaseTargeting();
		expect(manager.active).toBe(true);
		releaseMenu();
		expect(manager.active).toBe(false);
	});

	test("makes release idempotent and reset clears abandoned owners", () => {
		const manager = new ClientInputLockManager();
		const release = manager.acquire();

		release();
		release();
		expect(manager.active).toBe(false);

		manager.acquire();
		manager.reset();
		expect(manager.active).toBe(false);
	});
});
