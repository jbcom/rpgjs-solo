export interface StudioViewportBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getPixiLocalViewportBounds(engine: any, world: any): StudioViewportBounds | null {
  const screen = getRendererScreen(engine);
  const transform = world?.worldTransform;
  if (!screen || !transform) return null;

  const topLeft = applyInverseTransform(transform, screen.x, screen.y);
  const topRight = applyInverseTransform(transform, screen.x + screen.width, screen.y);
  const bottomLeft = applyInverseTransform(transform, screen.x, screen.y + screen.height);
  const bottomRight = applyInverseTransform(transform, screen.x + screen.width, screen.y + screen.height);
  if (!topLeft || !topRight || !bottomLeft || !bottomRight) return null;

  const minX = Math.min(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x);
  const minY = Math.min(topLeft.y, topRight.y, bottomLeft.y, bottomRight.y);
  const maxX = Math.max(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x);
  const maxY = Math.max(topLeft.y, topRight.y, bottomLeft.y, bottomRight.y);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function createViewportCullKey(bounds: StudioViewportBounds, gridSize: number): string {
  const size = Math.max(1, Number(gridSize) || 1);
  return [
    Math.floor(bounds.x / size),
    Math.floor(bounds.y / size),
    Math.ceil(bounds.width / size),
    Math.ceil(bounds.height / size),
  ].join(":");
}

function getRendererScreen(engine: any): StudioViewportBounds | null {
  const renderer = engine?.renderer;
  const screen = renderer?.screen;
  const browserWidth = typeof window !== "undefined" ? window.innerWidth : 0;
  const browserHeight = typeof window !== "undefined" ? window.innerHeight : 0;
  const width =
    Number(screen?.width) ||
    Number(renderer?.width) ||
    Number(renderer?.canvas?.width) ||
    Number(browserWidth) ||
    0;
  const height =
    Number(screen?.height) ||
    Number(renderer?.height) ||
    Number(renderer?.canvas?.height) ||
    Number(browserHeight) ||
    0;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return {
    x: Number(screen?.x) || 0,
    y: Number(screen?.y) || 0,
    width,
    height,
  };
}

function applyInverseTransform(
  transform: { a: number; b: number; c: number; d: number; tx: number; ty: number },
  x: number,
  y: number
): { x: number; y: number } | null {
  const determinant = transform.a * transform.d - transform.b * transform.c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= 0.000001) {
    return null;
  }

  const localX = x - transform.tx;
  const localY = y - transform.ty;
  return {
    x: (transform.d * localX - transform.c * localY) / determinant,
    y: (-transform.b * localX + transform.a * localY) / determinant,
  };
}
