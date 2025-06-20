import { existsSync } from "fs";
import { dirname } from "path";
import { join } from "path";

export function replaceConfigImport() {
  return {
    name: "replace-config-import",
    transform(code: string, id: string) {
      if (!id.endsWith("src/index.ts")) {
        return;
      }

      const baseDir = dirname(id);
      const isProd = process.env.NODE_ENV === "production";
      const configFile = isProd ? "config.prod.ts" : "config.dev.ts";
      const configPath = join(baseDir, configFile);
      if (existsSync(configPath)) {
        const newImport = isProd ? "./config.prod" : "./config.dev";
        // Using regex to match both single and double quotes
        return code.replace(/['"]\.\/(config)['"]/g, `"${newImport}"`);
      }
    },
  };
}
