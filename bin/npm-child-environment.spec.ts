import { describe, expect, it } from "vitest";
import { npmChildEnvironment } from "./npm-child-environment.mjs";

describe("npm child environment", () => {
	it("preserves the complete direct-invocation environment", () => {
		const directEnvironment = {
			HOME: "/tmp/direct-home",
			NPM_CONFIG_REGISTRY: "https://registry.npmjs.org/",
			RPGJS_AUDIT_SENTINEL: "preserved",
		};

		expect(npmChildEnvironment(directEnvironment)).toEqual(directEnvironment);
	});

	it("removes only pnpm-script keys that npm rejects", () => {
		const pnpmScriptEnvironment = {
			HOME: "/tmp/pnpm-home",
			http_proxy: "http://standard-proxy.test",
			npm_config_http_proxy: "http://pnpm-alias.test",
			npm_config_manage_package_manager_versions: "false",
			npm_config_proxy: "http://npm-proxy.test",
			npm_config_registry: "https://registry.npmjs.org/",
			RPGJS_AUDIT_SENTINEL: "preserved",
		};

		expect(npmChildEnvironment(pnpmScriptEnvironment)).toEqual({
			HOME: "/tmp/pnpm-home",
			http_proxy: "http://standard-proxy.test",
			npm_config_proxy: "http://npm-proxy.test",
			npm_config_registry: "https://registry.npmjs.org/",
			RPGJS_AUDIT_SENTINEL: "preserved",
		});
	});

	it("matches environment keys case-insensitively without broad filtering", () => {
		const childEnvironment = npmChildEnvironment({
			NPM_CONFIG_HTTP_PROXY: "http://pnpm-alias.test",
			NPM_CONFIG_MANAGE_PACKAGE_MANAGER_VERSIONS: "true",
			HTTP_PROXY: "http://standard-proxy.test",
			NPM_CONFIG_STRICT_SSL: "true",
		});

		expect(childEnvironment).toEqual({
			HTTP_PROXY: "http://standard-proxy.test",
			NPM_CONFIG_STRICT_SSL: "true",
		});
	});
});
