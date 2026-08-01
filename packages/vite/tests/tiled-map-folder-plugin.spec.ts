import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Plugin, ResolvedConfig } from "vite";
import {
  tiledMapFolderPlugin,
  type DataFolderPluginOptions,
} from "../src/tiled-map-folder-plugin";

const fixtureRoots: string[] = [];

function createFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "rpgjs-tiled-folder-"));
  fixtureRoots.push(root);
  mkdirSync(join(root, "src/tiled/nested"), { recursive: true });
  writeFileSync(join(root, "src/tiled/simplemap.tmx"), "<map id=\"simplemap\" />\n");
  writeFileSync(join(root, "src/tiled/nested/terrain.tsx"), "<tileset name=\"terrain\" />\n");
  writeFileSync(join(root, "src/tiled/ignored.txt"), "not public\n");
  return root;
}

function hookHandler(hook: unknown): ((...args: any[]) => any) {
  if (typeof hook === "function") return hook;
  return (hook as { handler: (...args: any[]) => any }).handler;
}

function resolvePlugin(
  plugin: Plugin,
  root: string,
  overrides: Partial<ResolvedConfig> = {},
): void {
  const config = {
    command: "build",
    root,
    base: "/",
    build: { outDir: "dist" },
    ...overrides,
  } as ResolvedConfig;
  hookHandler(plugin.configResolved).call(plugin, config);
}

function generate(plugin: Plugin): void {
  hookHandler(plugin.generateBundle).call({});
}

function createPlugin(options: Partial<DataFolderPluginOptions> = {}): Plugin {
  return tiledMapFolderPlugin({
    sourceFolder: "src/tiled",
    ...options,
  });
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("tiledMapFolderPlugin production path contract", () => {
  it("derives the default output from publicPath and preserves nested files", () => {
    const root = createFixture();
    const plugin = createPlugin();

    resolvePlugin(plugin, root);
    generate(plugin);

    expect(readFileSync(join(root, "dist/data/simplemap.tmx"), "utf8")).toContain("simplemap");
    expect(readFileSync(join(root, "dist/data/nested/terrain.tsx"), "utf8")).toContain("terrain");
    expect(existsSync(join(root, "dist/data/ignored.txt"))).toBe(false);
    expect(existsSync(join(root, "dist/assets/data/simplemap.tmx"))).toBe(false);
  });

  it("accepts an explicitly matching normalized output path", () => {
    const root = createFixture();
    const plugin = createPlugin({ publicPath: "/map/", buildOutputPath: "./map/" });

    resolvePlugin(plugin, root);
    generate(plugin);

    expect(existsSync(join(root, "dist/map/simplemap.tmx"))).toBe(true);
  });

  it("rejects an explicit static-host mismatch with an actionable correction", () => {
    const root = createFixture();
    const plugin = createPlugin({ publicPath: "/map", buildOutputPath: "assets/data" });

    expect(() => resolvePlugin(plugin, root)).toThrowError(
      /Set buildOutputPath to "map" \(or omit it\).*allowExternalPublicPathRewrite: true/s,
    );
  });

  it("permits an acknowledged external rewrite without duplicating output", () => {
    const root = createFixture();
    const plugin = createPlugin({
      publicPath: "/map",
      buildOutputPath: "assets/data",
      allowExternalPublicPathRewrite: true,
    });

    resolvePlugin(plugin, root);
    generate(plugin);

    expect(existsSync(join(root, "dist/assets/data/simplemap.tmx"))).toBe(true);
    expect(existsSync(join(root, "dist/map/simplemap.tmx"))).toBe(false);
  });

  it("normalizes Vite root, repository base, and a base-prefixed publicPath", () => {
    const root = createFixture();
    const plugin = createPlugin({ publicPath: "/quest-for-the-crown/map/" });

    resolvePlugin(plugin, root, { base: "/quest-for-the-crown/" } as Partial<ResolvedConfig>);
    generate(plugin);

    expect(existsSync(join(root, "dist/map/simplemap.tmx"))).toBe(true);
    expect(existsSync(join(root, "dist/quest-for-the-crown/map/simplemap.tmx"))).toBe(false);
  });

  it("supports the Vite base root without inventing an extra output directory", () => {
    const root = createFixture();
    const plugin = createPlugin({ publicPath: "/" });

    resolvePlugin(plugin, root, { base: "/quest-for-the-crown/" } as Partial<ResolvedConfig>);
    generate(plugin);

    expect(existsSync(join(root, "dist/simplemap.tmx"))).toBe(true);
    expect(existsSync(join(root, "dist/nested/terrain.tsx"))).toBe(true);
  });

  it.each([
    { publicPath: "/map/../private" },
    { publicPath: "/map/%2e%2e/private" },
    { publicPath: "https://cdn.example/maps" },
    { buildOutputPath: "../outside" },
    { buildOutputPath: "/absolute" },
  ])("rejects unsafe configuration paths: %o", (options) => {
    const root = createFixture();
    expect(() => resolvePlugin(createPlugin(options), root)).toThrowError(/tiled-map-folder/);
  });
});

describe("tiledMapFolderPlugin development routing", () => {
  it("serves nested files under Vite base and blocks encoded traversal", () => {
    const root = createFixture();
    const plugin = createPlugin({ publicPath: "/map" });
    resolvePlugin(plugin, root, {
      command: "serve",
      base: "/quest-for-the-crown/",
    } as Partial<ResolvedConfig>);

    let middleware: ((req: any, res: any, next: () => void) => void) | undefined;
    const logger = { warn: vi.fn(), error: vi.fn() };
    hookHandler(plugin.configureServer).call(plugin, {
      config: { logger },
      middlewares: {
        use(handler: typeof middleware) {
          middleware = handler;
        },
      },
    });
    expect(middleware).toBeTypeOf("function");

    const headers = new Map<string, string>();
    let statusCode = 200;
    let body = "";
    const response = {
      get statusCode() { return statusCode; },
      set statusCode(value: number) { statusCode = value; },
      setHeader(name: string, value: string) { headers.set(name, value); },
      end(value: Buffer | string = "") { body = value.toString(); },
    };
    const next = vi.fn();

    middleware!({ url: "/quest-for-the-crown/map/nested/terrain.tsx?cache=1" }, response, next);
    expect(statusCode).toBe(200);
    expect(headers.get("Content-Type")).toBe("application/xml");
    expect(body).toContain("terrain");
    expect(next).not.toHaveBeenCalled();

    statusCode = 200;
    body = "";
    middleware!({ url: "/quest-for-the-crown/map/%2e%2e/private.tmx" }, response, next);
    expect(statusCode).toBe(403);
    expect(body).toBe("Forbidden");

    middleware!({ url: "/quest-for-the-crown/maps/simplemap.tmx" }, response, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("serves only a regular file opened inside the canonical data folder", () => {
    const root = createFixture();
    const outsideRoot = mkdtempSync(join(tmpdir(), "rpgjs-tiled-outside-"));
    fixtureRoots.push(outsideRoot);
    writeFileSync(join(outsideRoot, "private.tmx"), "<map id=\"private\" />\n");
    symlinkSync(
      join(outsideRoot, "private.tmx"),
      join(root, "src/tiled/linked.tmx")
    );

    const plugin = createPlugin({ publicPath: "/map" });
    resolvePlugin(plugin, root, { command: "serve", base: "/" } as Partial<ResolvedConfig>);
    let middleware: ((req: any, res: any, next: () => void) => void) | undefined;
    const logger = { warn: vi.fn(), error: vi.fn() };
    hookHandler(plugin.configureServer).call(plugin, {
      config: { logger },
      middlewares: { use(handler: typeof middleware) { middleware = handler; } },
    });

    const invoke = (url: string) => {
      let statusCode = 200;
      let body = "";
      middleware!(
        { url },
        {
          get statusCode() { return statusCode; },
          set statusCode(value: number) { statusCode = value; },
          setHeader() {},
          end(value: Buffer | string = "") { body = value.toString(); },
        },
        vi.fn()
      );
      return { statusCode, body };
    };

    expect(invoke("/map/linked.tmx")).toEqual({
      statusCode: 403,
      body: "Forbidden",
    });
    expect(invoke("/map/vanished.tmx")).toEqual({
      statusCode: 404,
      body: "Not Found",
    });
    expect(logger.error).not.toHaveBeenCalled();
  });
});
