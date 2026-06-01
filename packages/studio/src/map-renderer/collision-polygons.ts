import {
  STUDIO_TERRAIN_TILE_SIZE,
  type StudioCollisionPolygon,
  type StudioTerrainMorphologyFeature,
} from "./types";
import { createStudioTerrainRenderData } from "./map-normalizer";

interface BooleanMask {
  width: number;
  height: number;
  cells: boolean[][];
}

export function buildStudioTerrainCollisionPolygons(map: any): StudioCollisionPolygon[] {
  const data = createStudioTerrainRenderData(map);
  const terrainMask = createEmptyMask(data.widthTiles, data.heightTiles);

  for (let y = 0; y < data.heightTiles; y += 1) {
    for (let x = 0; x < data.widthTiles; x += 1) {
      terrainMask.cells[y][x] = data.terrainGrid[y]?.[x]?.collision === true;
    }
  }

  const polygons = rectanglesToPolygons(
    maskToRectangles(terrainMask),
    "terrain_collision",
    data.tileSize
  );

  data.morphologyFeatures.forEach((feature) => {
    const edgeMask = createMorphologyEdgeMask(feature, data.widthTiles, data.heightTiles, data.tileSize);
    const type =
      feature.kind === "hole"
        ? "morphology_hole_edge_collision"
        : "morphology_wall_edge_collision";
    polygons.push(...rectanglesToPolygons(maskToRectangles(edgeMask), type, data.tileSize, feature.id));
  });

  return polygons;
}

function createEmptyMask(width: number, height: number): BooleanMask {
  return {
    width,
    height,
    cells: Array.from({ length: height }, () => Array(width).fill(false)),
  };
}

function createMorphologyEdgeMask(
  feature: StudioTerrainMorphologyFeature,
  width: number,
  height: number,
  tileSize: number
): BooleanMask {
  if (feature.kind === "wall") {
    return createWallMorphologyEdgeMask(feature, width, height, tileSize);
  }

  const mask = createEmptyMask(width, height);
  const edgeWidth = Math.max(tileSize * 0.72, 18);

  feature.strokes.forEach((stroke) => {
    if (stroke.points.length === 1) {
      markSegmentEdge(mask, tileSize, stroke.points[0], stroke.points[0], stroke.radius, edgeWidth);
      return;
    }
    for (let index = 1; index < stroke.points.length; index += 1) {
      markSegmentEdge(
        mask,
        tileSize,
        stroke.points[index - 1],
        stroke.points[index],
        stroke.radius,
        edgeWidth
      );
    }
  });

  return mask;
}

function createWallMorphologyEdgeMask(
  feature: StudioTerrainMorphologyFeature,
  width: number,
  height: number,
  tileSize: number
): BooleanMask {
  const mask = createEmptyMask(width, height);
  const edgeWidth = Math.max(tileSize * 0.72, 18);
  const backCollisionOffset = resolveWallBackCollisionOffset(feature, tileSize);

  feature.strokes.forEach((stroke) => {
    if (stroke.points.length === 1) {
      markWallSegmentEdge(mask, tileSize, stroke.points[0], stroke.points[0], stroke.radius, edgeWidth, backCollisionOffset);
      return;
    }
    for (let index = 1; index < stroke.points.length; index += 1) {
      markWallSegmentEdge(
        mask,
        tileSize,
        stroke.points[index - 1],
        stroke.points[index],
        stroke.radius,
        edgeWidth,
        backCollisionOffset
      );
    }
  });

  return mask;
}

function resolveWallBackCollisionOffset(feature: StudioTerrainMorphologyFeature, tileSize: number): number {
  const explicitOffset = Number(feature.params.backCollisionOffset ?? feature.params.collisionOffsetY);
  if (Number.isFinite(explicitOffset) && explicitOffset >= 0) {
    return Math.min(tileSize * 2, explicitOffset);
  }

  const wallHeight = Number(feature.params.height);
  const resolvedHeight = Number.isFinite(wallHeight) && wallHeight > 0 ? wallHeight : tileSize;
  return Math.max(tileSize * 0.45, Math.min(tileSize * 1.25, resolvedHeight * 0.55));
}

function markSegmentEdge(
  mask: BooleanMask,
  tileSize: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
  radius: number,
  edgeWidth: number
): void {
  const outer = Math.max(1, radius + tileSize * 0.5);
  const inner = Math.max(0, radius - edgeWidth);
  const minX = Math.max(0, Math.floor((Math.min(from.x, to.x) - outer) / tileSize));
  const minY = Math.max(0, Math.floor((Math.min(from.y, to.y) - outer) / tileSize));
  const maxX = Math.min(mask.width - 1, Math.floor((Math.max(from.x, to.x) + outer) / tileSize));
  const maxY = Math.min(mask.height - 1, Math.floor((Math.max(from.y, to.y) + outer) / tileSize));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const center = {
        x: x * tileSize + tileSize / 2,
        y: y * tileSize + tileSize / 2,
      };
      const distance = distanceToSegment(center, from, to);
      if (distance <= outer && distance >= inner) {
        mask.cells[y][x] = true;
      }
    }
  }
}

function markWallSegmentEdge(
  mask: BooleanMask,
  tileSize: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
  radius: number,
  edgeWidth: number,
  backCollisionOffset: number
): void {
  const outer = Math.max(1, radius + tileSize * 0.5);
  const inner = Math.max(0, radius - edgeWidth);
  const minX = Math.max(0, Math.floor((Math.min(from.x, to.x) - outer) / tileSize));
  const minY = Math.max(0, Math.floor((Math.min(from.y, to.y) - outer) / tileSize));
  const maxX = Math.min(mask.width - 1, Math.floor((Math.max(from.x, to.x) + outer) / tileSize));
  const maxY = Math.min(mask.height - 1, Math.floor((Math.max(from.y, to.y) + outer + backCollisionOffset) / tileSize));
  const backThreshold = tileSize * 0.1;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const center = {
        x: x * tileSize + tileSize / 2,
        y: y * tileSize + tileSize / 2,
      };
      const closest = closestPointOnSegment(center, from, to);
      const distance = Math.hypot(center.x - closest.x, center.y - closest.y);
      if (distance > outer || distance < inner) continue;

      const targetY = center.y < closest.y - backThreshold
        ? center.y + backCollisionOffset
        : center.y;
      markMaskCellAtWorld(mask, tileSize, center.x, targetY);
    }
  }
}

function markMaskCellAtWorld(mask: BooleanMask, tileSize: number, x: number, y: number): void {
  const tileX = Math.floor(x / tileSize);
  const tileY = Math.floor(y / tileSize);
  if (tileX < 0 || tileY < 0 || tileX >= mask.width || tileY >= mask.height) return;
  mask.cells[tileY][tileX] = true;
}

function maskToRectangles(mask: BooleanMask): Array<{ x: number; y: number; width: number; height: number }> {
  const visited = Array.from({ length: mask.height }, () => Array(mask.width).fill(false));
  const rectangles: Array<{ x: number; y: number; width: number; height: number }> = [];

  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (!mask.cells[y][x] || visited[y][x]) continue;

      let width = 1;
      while (x + width < mask.width && mask.cells[y][x + width] && !visited[y][x + width]) {
        width += 1;
      }

      let height = 1;
      let canGrow = true;
      while (y + height < mask.height && canGrow) {
        for (let dx = 0; dx < width; dx += 1) {
          if (!mask.cells[y + height][x + dx] || visited[y + height][x + dx]) {
            canGrow = false;
            break;
          }
        }
        if (canGrow) height += 1;
      }

      for (let dy = 0; dy < height; dy += 1) {
        for (let dx = 0; dx < width; dx += 1) {
          visited[y + dy][x + dx] = true;
        }
      }

      rectangles.push({ x, y, width, height });
    }
  }

  return rectangles;
}

function rectanglesToPolygons(
  rectangles: Array<{ x: number; y: number; width: number; height: number }>,
  type: StudioCollisionPolygon["type"],
  tileSize: number,
  sourceId = "terrain"
): StudioCollisionPolygon[] {
  return rectangles.map((rect, index) => {
    const x = rect.x * tileSize;
    const y = rect.y * tileSize;
    const width = rect.width * tileSize;
    const height = rect.height * tileSize;
    return {
      id: `${type}_${sourceId}_${index}_${rect.x}_${rect.y}`,
      type,
      x,
      y,
      width,
      height,
      points: [
        [x, y],
        [x + width, y],
        [x + width, y + height],
        [x, y + height],
      ],
      properties: {
        source: sourceId,
        tileX: rect.x,
        tileY: rect.y,
        tileWidth: rect.width,
        tileHeight: rect.height,
      },
    };
  });
}

function distanceToSegment(
  point: { x: number; y: number },
  from: { x: number; y: number },
  to: { x: number; y: number }
): number {
  const closest = closestPointOnSegment(point, from, to);
  return Math.hypot(point.x - closest.x, point.y - closest.y);
}

function closestPointOnSegment(
  point: { x: number; y: number },
  from: { x: number; y: number },
  to: { x: number; y: number }
): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return from;
  }
  const ratio = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared));
  return {
    x: from.x + dx * ratio,
    y: from.y + dy * ratio,
  };
}
