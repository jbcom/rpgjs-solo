export interface TiledXmlResponseContext {
  kind: "map" | "tileset";
  id: string;
  url: string;
}

function startsWithHtml(body: string): boolean {
  const normalized = body.replace(/^\uFEFF/, "").trimStart();
  return /^<!doctype\s+html\b/i.test(normalized) || /^<html(?:\s|>)/i.test(normalized);
}

function bodyPreview(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 80);
}

/**
 * Read a TMX/TSX response and reject the HTML document returned by an SPA
 * fallback before passing it to the XML parser.
 */
export async function readTiledXmlResponse(
  response: Response,
  context: TiledXmlResponseContext,
): Promise<string> {
  if (!response.ok) {
    throw new Error(
      `Unable to load Tiled ${context.kind} '${context.id}' from '${context.url}': `
      + `${response.status} ${response.statusText}`,
    );
  }

  const body = await response.text();
  const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() || "unknown";
  const htmlContentType = contentType === "text/html" || contentType === "application/xhtml+xml";

  if (htmlContentType || startsWithHtml(body)) {
    throw new Error(
      `Unable to load Tiled ${context.kind} '${context.id}' from '${context.url}': expected TMX/TSX XML `
      + `but received an SPA HTML fallback (Content-Type: ${contentType}; body starts ${JSON.stringify(bodyPreview(body))}). `
      + "Ensure tiledMapFolderPlugin publicPath/buildOutputPath and provideTiledMap basePath resolve to the same deployed URL.",
    );
  }

  return body;
}
