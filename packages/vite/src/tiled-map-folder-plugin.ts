import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    realpathSync,
    statSync,
} from 'node:fs';
import {
    dirname,
    extname,
    isAbsolute,
    join,
    relative,
    resolve,
    sep,
} from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

export interface DataFolderPluginOptions {
    /**
     * Source folder containing the data files (TMX, TSX, images).
     * Relative paths are resolved from Vite's configured root.
     */
    sourceFolder: string;

    /**
     * Base-relative public URL prefix for accessing the data files.
     * Vite's configured `base` is applied when serving in development.
     * @default '/data'
     */
    publicPath?: string;

    /**
     * Target folder in the build output for the data files. When omitted, this
     * is derived from `publicPath` (`/data` becomes `data`) so development and
     * static production URLs stay identical.
     */
    buildOutputPath?: string;

    /**
     * Allow `buildOutputPath` to differ from `publicPath` when an external
     * server or CDN explicitly rewrites the public URL to the emitted folder.
     * Static hosts such as GitHub Pages do not provide that rewrite.
     * @default false
     */
    allowExternalPublicPathRewrite?: boolean;

    /**
     * File extensions to include.
     * @default ['.tmx', '.tsx', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']
     */
    allowedExtensions?: string[];
}

const DEFAULT_EXTENSIONS = ['.tmx', '.tsx', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];

function decodeConfiguredPath(value: string, option: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        throw new Error(`[tiled-map-folder] ${option} contains invalid percent encoding: ${JSON.stringify(value)}`);
    }
}

function assertSafeSegments(value: string, option: string): void {
    if (value.includes('\0')) {
        throw new Error(`[tiled-map-folder] ${option} cannot contain a null byte.`);
    }
    if (value.split('/').some((segment) => segment === '..')) {
        throw new Error(`[tiled-map-folder] ${option} cannot traverse outside its root: ${JSON.stringify(value)}`);
    }
}

function normalizePublicPath(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
        throw new Error('[tiled-map-folder] publicPath cannot be empty. Use "/" for the Vite base root.');
    }
    if (trimmed.includes('\\') || trimmed.includes('?') || trimmed.includes('#')) {
        throw new Error(`[tiled-map-folder] publicPath must be a URL pathname without backslashes, a query, or a hash: ${JSON.stringify(value)}`);
    }
    if (/^[a-z][a-z\d+.-]*:/i.test(trimmed) || trimmed.startsWith('//')) {
        throw new Error(`[tiled-map-folder] publicPath must be base-relative, not an absolute URL: ${JSON.stringify(value)}`);
    }

    const decoded = decodeConfiguredPath(trimmed, 'publicPath');
    assertSafeSegments(decoded, 'publicPath');
    const segments = decoded.split('/').filter((segment) => segment && segment !== '.');
    return segments.length ? `/${segments.join('/')}` : '/';
}

function normalizeBuildOutputPath(value: string): string {
    const trimmed = value.trim().replaceAll('\\', '/');
    if (/^[a-z]:\//i.test(trimmed) || trimmed.startsWith('/')) {
        throw new Error(`[tiled-map-folder] buildOutputPath must stay relative to Vite's output directory: ${JSON.stringify(value)}`);
    }

    assertSafeSegments(trimmed, 'buildOutputPath');
    return trimmed.split('/').filter((segment) => segment && segment !== '.').join('/');
}

function normalizeViteBase(base: string): string {
    if (!base || base === './') return '/';
    if (/^[a-z][a-z\d+.-]*:/i.test(base)) {
        return normalizePublicPath(new URL(base).pathname);
    }
    return normalizePublicPath(base);
}

function stripViteBase(publicPath: string, base: string): string {
    if (base === '/') return publicPath;
    if (publicPath === base) return '/';
    if (publicPath.startsWith(`${base}/`)) {
        return publicPath.slice(base.length) || '/';
    }
    return publicPath;
}

function joinPublicPaths(base: string, publicPath: string): string {
    if (base === '/') return publicPath;
    if (publicPath === '/') return base;
    return `${base}${publicPath}`;
}

function publicPathToBuildOutput(publicPath: string): string {
    return publicPath === '/' ? '' : publicPath.slice(1);
}

function pathIsWithin(root: string, candidate: string): boolean {
    const relation = relative(root, candidate);
    return relation === '' || (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation));
}

function matchesPublicPrefix(pathname: string, prefix: string): boolean {
    if (prefix === '/') return pathname.startsWith('/');
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Vite plugin that serves a Tiled data folder in development and copies the
 * same route into a static production build.
 */
export function tiledMapFolderPlugin(options: DataFolderPluginOptions): Plugin {
    const {
        sourceFolder,
        publicPath = '/data',
        buildOutputPath,
        allowExternalPublicPathRewrite = false,
        allowedExtensions = DEFAULT_EXTENSIONS,
    } = options;

    const normalizedExtensions = allowedExtensions.map((extension) => extension.toLowerCase());
    let isBuild = false;
    let resolvedSourceFolder = '';
    let resolvedOutputDir = '';
    let resolvedBuildOutputPath = '';
    let resolvedServePath = '';

    const getMimeType = (filePath: string): string => {
        const ext = extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
            '.tmx': 'application/xml',
            '.tsx': 'application/xml',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
        };
        return mimeTypes[ext] || 'application/octet-stream';
    };

    const isAllowedFile = (filePath: string): boolean => normalizedExtensions.includes(extname(filePath).toLowerCase());

    const getAllFiles = (dirPath: string): string[] => {
        if (!existsSync(dirPath)) return [];

        return readdirSync(dirPath).flatMap((item) => {
            const fullPath = join(dirPath, item);
            const stat = statSync(fullPath);
            if (stat.isDirectory()) return getAllFiles(fullPath);
            return isAllowedFile(fullPath) ? [fullPath] : [];
        });
    };

    const copyFilesToBuild = (): void => {
        const canonicalSourceFolder = realpathSync(resolvedSourceFolder);
        for (const filePath of getAllFiles(resolvedSourceFolder)) {
            const canonicalFilePath = realpathSync(filePath);
            if (!pathIsWithin(canonicalSourceFolder, canonicalFilePath)) {
                throw new Error(`[tiled-map-folder] Refusing to copy a source outside the data folder: ${filePath}`);
            }
            const relativePath = relative(resolvedSourceFolder, filePath);
            const targetPath = resolve(resolvedOutputDir, resolvedBuildOutputPath, relativePath);
            if (!pathIsWithin(resolvedOutputDir, targetPath)) {
                throw new Error(`[tiled-map-folder] Refusing to emit outside Vite's output directory: ${targetPath}`);
            }
            mkdirSync(dirname(targetPath), { recursive: true });
            copyFileSync(canonicalFilePath, targetPath);
        }
    };

    return {
        name: 'data-folder',
        enforce: 'pre',

        configResolved(config: ResolvedConfig) {
            isBuild = config.command === 'build';
            const normalizedBase = normalizeViteBase(config.base);
            const normalizedPublicPath = stripViteBase(normalizePublicPath(publicPath), normalizedBase);
            const derivedBuildOutputPath = publicPathToBuildOutput(normalizedPublicPath);
            const configuredBuildOutputPath = buildOutputPath === undefined
                ? derivedBuildOutputPath
                : normalizeBuildOutputPath(buildOutputPath);

            if (buildOutputPath !== undefined
                && configuredBuildOutputPath !== derivedBuildOutputPath
                && !allowExternalPublicPathRewrite) {
                throw new Error(
                    `[tiled-map-folder] publicPath ${JSON.stringify(normalizedPublicPath)} is emitted at `
                    + `${JSON.stringify(derivedBuildOutputPath || '.')} on a static host, but buildOutputPath is `
                    + `${JSON.stringify(configuredBuildOutputPath || '.')}. Set buildOutputPath to `
                    + `${JSON.stringify(derivedBuildOutputPath)} (or omit it), or set `
                    + 'allowExternalPublicPathRewrite: true only when an external server/CDN rewrites that URL.',
                );
            }

            const root = resolve(config.root);
            resolvedSourceFolder = isAbsolute(sourceFolder) ? resolve(sourceFolder) : resolve(root, sourceFolder);
            resolvedOutputDir = isAbsolute(config.build.outDir)
                ? resolve(config.build.outDir)
                : resolve(root, config.build.outDir);
            resolvedBuildOutputPath = configuredBuildOutputPath;
            resolvedServePath = joinPublicPaths(normalizedBase, normalizedPublicPath);
        },

        generateBundle() {
            if (isBuild) copyFilesToBuild();
        },

        configureServer(server) {
            if (!existsSync(resolvedSourceFolder)) {
                server.config.logger.warn(`[tiled-map-folder] Data folder not found: ${resolvedSourceFolder}`);
                return;
            }

            const canonicalSourceFolder = realpathSync(resolvedSourceFolder);
            server.middlewares.use((req, res, next) => {
                const rawPath = req.url?.split(/[?#]/, 1)[0] ?? '';
                let pathname: string;
                try {
                    pathname = decodeURIComponent(rawPath);
                } catch {
                    res.statusCode = 400;
                    res.end('Bad Request');
                    return;
                }

                if (!matchesPublicPrefix(pathname, resolvedServePath)) return next();

                const relativePath = resolvedServePath === '/'
                    ? pathname.slice(1)
                    : pathname.slice(resolvedServePath.length).replace(/^\//, '');
                if (relativePath.includes('\0') || relativePath.split('/').some((segment) => segment === '..')) {
                    res.statusCode = 403;
                    res.end('Forbidden');
                    return;
                }

                const filePath = resolve(canonicalSourceFolder, relativePath);
                if (!pathIsWithin(canonicalSourceFolder, filePath)) {
                    res.statusCode = 403;
                    res.end('Forbidden');
                    return;
                }
                if (!existsSync(filePath) || !isAllowedFile(filePath) || !statSync(filePath).isFile()) {
                    res.statusCode = 404;
                    res.end('Not Found');
                    return;
                }
                if (!pathIsWithin(canonicalSourceFolder, realpathSync(filePath))) {
                    res.statusCode = 403;
                    res.end('Forbidden');
                    return;
                }

                try {
                    res.setHeader('Content-Type', getMimeType(filePath));
                    res.setHeader('Cache-Control', 'no-cache');
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.end(readFileSync(filePath));
                } catch (error) {
                    server.config.logger.error(`[tiled-map-folder] Unable to serve ${filePath}: ${String(error)}`);
                    res.statusCode = 500;
                    res.end('Internal Server Error');
                }
            });
        },
    };
}
