import type { RpgTransportServer } from "./types";

interface ResolveMapOptions {
  host?: string;
  headers?: Headers;
  mapUpdateToken?: string;
  tiledBasePaths?: string[];
}

export const MAP_UPDATE_TOKEN_HEADER = "x-rpgjs-map-update-token";
export const MAP_UPDATE_TOKEN_ENV = "RPGJS_MAP_UPDATE_TOKEN";

type RuntimeProcess = {
  cwd?: () => string;
  env?: Record<string, string | undefined>;
};

function getRuntimeProcess(): RuntimeProcess | undefined {
  return (globalThis as { process?: RuntimeProcess }).process;
}

function readEnvVariable(name: string): string | undefined {
  const value = getRuntimeProcess()?.env?.[name];
  return typeof value === "string" ? value : undefined;
}

function getWorkingDirectory(): string | undefined {
  const cwd = getRuntimeProcess()?.cwd;
  if (typeof cwd !== "function") {
    return undefined;
  }

  try {
    return cwd();
  } catch {
    return undefined;
  }
}

function normalizeRoomMapId(roomId: string): string {
  return roomId.startsWith("map-") ? roomId.slice(4) : roomId;
}

function toBasePathPrefix(basePath: string): string {
  const trimmed = basePath.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function extractFileLikeMapDefinition(maps: any[], mapId: string): any | null {
  for (const mapDef of maps) {
    if (typeof mapDef === "object" && mapDef) {
      const candidateId = typeof mapDef.id === "string" ? mapDef.id.replace(/^map-/, "") : "";
      if (candidateId === mapId) {
        return mapDef;
      }
      continue;
    }

    if (typeof mapDef === "string") {
      const fileName = mapDef.split("/").pop()?.replace(/\.tmx$/i, "");
      if (fileName === mapId) {
        return { id: mapId, file: mapDef };
      }
    }
  }

  return null;
}

async function fetchTextByUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  }
}

async function readTextByFilePath(pathLike: string): Promise<string | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    const { isAbsolute, join } = await import("node:path");

    const cwd = getWorkingDirectory();
    const candidates = isAbsolute(pathLike) || !cwd ? [pathLike] : [pathLike, join(cwd, pathLike)];

    for (const candidate of candidates) {
      try {
        return await readFile(candidate, "utf8");
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function getTiledBasePaths(paths?: string[]): string[] {
  const values = [
    ...(paths || []),
    readEnvVariable("RPGJS_TILED_BASE_PATH"),
    "map",
    "data",
    "assets/data",
    "assets/map",
  ].filter((value): value is string => !!value);

  return Array.from(new Set(values));
}

export function resolveMapUpdateToken(explicitToken?: string): string {
  return explicitToken ?? readEnvVariable(MAP_UPDATE_TOKEN_ENV) ?? "";
}

export function createMapUpdateHeaders(
  token?: string,
  init?: HeadersInit,
): Headers {
  const headers = new Headers(init);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const resolvedToken = resolveMapUpdateToken(token);
  if (resolvedToken) {
    headers.set(MAP_UPDATE_TOKEN_HEADER, resolvedToken);
  }
  return headers;
}

export function readMapUpdateToken(headers: Headers): string {
  const directToken = headers.get(MAP_UPDATE_TOKEN_HEADER);
  if (directToken) {
    return directToken;
  }

  const authorization = headers.get("authorization");
  if (!authorization) {
    return "";
  }

  const [scheme, value] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !value) {
    return "";
  }

  return value.trim();
}

export function isMapUpdateAuthorized(headers: Headers, expectedToken?: string): boolean {
  const requiredToken = resolveMapUpdateToken(expectedToken);
  if (!requiredToken) {
    return true;
  }
  return readMapUpdateToken(headers) === requiredToken;
}

async function resolveMapDocument(
  mapId: string,
  mapDefinition: any,
  options: ResolveMapOptions,
): Promise<{ xml: string; sourceUrl?: string }> {
  if (typeof mapDefinition?.data === "string" && mapDefinition.data.includes("<map")) {
    return { xml: mapDefinition.data };
  }

  if (typeof mapDefinition?.file === "string") {
    const file = mapDefinition.file.trim();
    if (file.includes("<map")) {
      return { xml: file };
    }
    if (/^https?:\/\//i.test(file)) {
      const xml = await fetchTextByUrl(file);
      if (xml) {
        return { xml, sourceUrl: file };
      }
    }
    if (file.startsWith("/") && options.host) {
      const sourceUrl = `http://${options.host}${file}`;
      const xml = await fetchTextByUrl(sourceUrl);
      if (xml) {
        return { xml, sourceUrl };
      }
    }
    const xmlFromFile = await readTextByFilePath(file);
    if (xmlFromFile) {
      return { xml: xmlFromFile };
    }
  }

  if (options.host) {
    for (const basePath of getTiledBasePaths(options.tiledBasePaths)) {
      const prefix = toBasePathPrefix(basePath);
      const sourceUrl = `http://${options.host}${prefix}/${mapId}.tmx`;
      const xml = await fetchTextByUrl(sourceUrl);
      if (xml) {
        return { xml, sourceUrl };
      }
    }
  }

  return { xml: "" };
}

export async function enrichMapWithParsedTiledData(payload: any, options: ResolveMapOptions = {}): Promise<void> {
  if (payload?.parsedMap || typeof payload?.id !== "string") {
    return;
  }

  const maps = Array.isArray(payload.__maps) ? payload.__maps : [];
  const mapDefinition = extractFileLikeMapDefinition(maps, payload.id);
  const mapDoc = await resolveMapDocument(payload.id, mapDefinition, options);
  if (!mapDoc.xml) {
    return;
  }

  try {
    const tiledModuleName = "@canvasengine/tiled";
    const tiledModule = await import(/* @vite-ignore */ tiledModuleName);
    const TiledParser = tiledModule?.TiledParser;
    if (!TiledParser) {
      return;
    }

    const mapParser = new TiledParser(mapDoc.xml);
    const parsedMap = mapParser.parseMap();
    const tilesets = Array.isArray(parsedMap?.tilesets) ? parsedMap.tilesets : [];
    const mergedTilesets: any[] = [];

    for (const tileset of tilesets) {
      if (!tileset?.source) {
        mergedTilesets.push(tileset);
        continue;
      }

      let tilesetUrl: string | undefined;
      if (mapDoc.sourceUrl) {
        try {
          tilesetUrl = new URL(tileset.source, mapDoc.sourceUrl).toString();
        } catch {
          tilesetUrl = undefined;
        }
      } else if (options.host) {
        const prefix = toBasePathPrefix(getTiledBasePaths(options.tiledBasePaths)[0] || "map");
        const candidatePath = tileset.source.startsWith("/")
          ? tileset.source
          : `${prefix}/${tileset.source}`.replace(/\/{2,}/g, "/");
        tilesetUrl = `http://${options.host}${candidatePath.startsWith("/") ? candidatePath : `/${candidatePath}`}`;
      }

      const tilesetRaw = tilesetUrl
        ? await fetchTextByUrl(tilesetUrl)
        : await readTextByFilePath(tileset.source);

      if (!tilesetRaw) {
        mergedTilesets.push(tileset);
        continue;
      }

      try {
        const tilesetParser = new TiledParser(tilesetRaw);
        const parsedTileset = tilesetParser.parseTileset();
        mergedTilesets.push({
          ...tileset,
          ...parsedTileset,
        });
      } catch {
        mergedTilesets.push(tileset);
      }
    }

    parsedMap.tilesets = mergedTilesets;
    payload.data = mapDoc.xml;
    payload.parsedMap = parsedMap;

    if (typeof parsedMap?.width === "number" && typeof parsedMap?.tilewidth === "number") {
      payload.width = parsedMap.width * parsedMap.tilewidth;
    }
    if (typeof parsedMap?.height === "number" && typeof parsedMap?.tileheight === "number") {
      payload.height = parsedMap.height * parsedMap.tileheight;
    }
  } catch {
    return;
  }
}

export async function updateMap(roomId: string, rpgServer: RpgTransportServer, options: ResolveMapOptions = {}): Promise<void> {
  if (!roomId.startsWith("map-")) {
    return;
  }

  try {
    const mapId = normalizeRoomMapId(roomId);
    const serverMaps = Array.isArray(rpgServer.maps) ? rpgServer.maps : [];
    const defaultMapPayload: any = {
      id: mapId,
      width: 0,
      height: 0,
      events: [],
      __maps: serverMaps,
    };

    await enrichMapWithParsedTiledData(defaultMapPayload, options);
    delete defaultMapPayload.__maps;

    const headers = createMapUpdateHeaders(options.mapUpdateToken, options.headers);

    await rpgServer.onRequest?.({
      url: `http://localhost/parties/main/${roomId}/map/update`,
      method: "POST",
      headers,
      json: async () => defaultMapPayload,
      text: async () => JSON.stringify(defaultMapPayload),
    });

    console.log(`Initialized map for room ${roomId} via POST /map/update`);
  } catch (error) {
    console.warn(`Failed initializing map for room ${roomId}:`, error);
  }
}
