const pnpmOnlyNpmConfigKeys = new Set([
	"npm_config_manage_package_manager_versions",
]);

/**
 * Return an environment for a real npm child without pnpm-only configuration.
 *
 * pnpm scripts expose workspace/package-manager configuration through the
 * historical npm_config_* namespace. npm treats unknown keys in that namespace
 * as its own configuration and warns on stderr. Remove only the one pnpm-owned
 * setting that npm cannot understand; every other variable and npm diagnostic
 * remains observable by the caller.
 */
export const npmChildEnvironment = (environment = process.env) => {
	const childEnvironment = { ...environment };
	for (const key of Object.keys(childEnvironment)) {
		if (pnpmOnlyNpmConfigKeys.has(key.toLowerCase())) {
			delete childEnvironment[key];
		}
	}
	return childEnvironment;
};
