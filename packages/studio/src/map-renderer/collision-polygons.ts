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
    if (feature.kind === "wall") {
      polygons.push(...createWallMorphologyCollisionPolygons(feature, data.width, data.height, data.tileSize));
      return;
    }

    const edgeMask = createMorphologyEdgeMask(feature, data.widthTiles, data.heightTiles, data.tileSize);
    const type = "morphology_hole_edge_collision";
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

function resolveWallBackCollisionOffset(feature: StudioTerrainMorphologyFeature, tileSize: number): number {
  const explicitOffset = Number(feature.params.backCollisionOffset ?? feature.params.collisionOffsetY);
  if (Number.isFinite(explicitOffset) && explicitOffset >= 0) {
    return Math.min(tileSize * 4, explicitOffset);
  }

  const wallHeight = Number(feature.params.height);
  const resolvedHeight = Number.isFinite(wallHeight) && wallHeight > 0 ? wallHeight : tileSize;
  return Math.max(tileSize * 0.45, Math.min(tileSize * 4, resolvedHeight));
}

function createWallMorphologyCollisionPolygons(
  feature: StudioTerrainMorphologyFeature,
  mapWidth: number,
  mapHeight: number,
  tileSize: number
): StudioCollisionPolygon[] {
  const thickness = resolveWallCollisionThickness(feature, tileSize);
  const backCollisionOffset = resolveWallBackCollisionOffset(feature, tileSize);
  const polygons: StudioCollisionPolygon[] = [];

  feature.strokes.forEach((stroke) => {
    if (stroke.points.length === 1) {
      pushWallCollisionRect(
        polygons,
        createWallSegmentCollisionRect(stroke.points[0], stroke.points[0], stroke.radius, thickness, backCollisionOffset, mapHeight),
        mapWidth,
        mapHeight,
        feature.id,
        stroke.id
      );
      pushWallBodyCollisionRect(
        polygons,
        feature,
        stroke.points[0],
        stroke.points[0],
        stroke.radius,
        thickness,
        backCollisionOffset,
        mapWidth,
        mapHeight,
        tileSize,
        stroke.id
      );
      return;
    }

    for (let index = 1; index < stroke.points.length; index += 1) {
      const segmentId = `${stroke.id}_${index}`;
      pushWallCollisionRect(
        polygons,
        createWallSegmentCollisionRect(
          stroke.points[index - 1],
          stroke.points[index],
          stroke.radius,
          thickness,
          backCollisionOffset,
          mapHeight
        ),
        mapWidth,
        mapHeight,
        feature.id,
        segmentId
      );
      pushWallBodyCollisionRect(
        polygons,
        feature,
        stroke.points[index - 1],
        stroke.points[index],
        stroke.radius,
        thickness,
        backCollisionOffset,
        mapWidth,
        mapHeight,
        tileSize,
        segmentId
      );
    }
  });

  return polygons;
}

function resolveWallCollisionThickness(feature: StudioTerrainMorphologyFeature, tileSize: number): number {
  const explicitThickness = Number(feature.params.collisionThickness ?? feature.params.edgeCollisionWidth);
  if (Number.isFinite(explicitThickness) && explicitThickness > 0) {
    return Math.min(tileSize, explicitThickness);
  }
  return Math.max(18, Math.min(tileSize * 0.58, 28));
}

function shouldCreateWallBodyCollision(
  feature: StudioTerrainMorphologyFeature,
  radius: number,
  tileSize: number
): boolean {
  if (feature.params.bodyCollision === false || feature.params.collisionMode === "edge") {
    return false;
  }
  if (feature.params.bodyCollision === true || feature.params.collisionMode === "body") {
    return true;
  }
  return radius >= tileSize * 1.1;
}

function pushWallBodyCollisionRect(
  polygons: StudioCollisionPolygon[],
  feature: StudioTerrainMorphologyFeature,
  from: { x: number; y: number },
  to: { x: number; y: number },
  radius: number,
  thickness: number,
  backCollisionOffset: number,
  mapWidth: number,
  mapHeight: number,
  tileSize: number,
  segmentId: string
): void {
  if (!shouldCreateWallBodyCollision(feature, radius, tileSize)) return;
  pushWallCollisionRect(
    polygons,
    createWallSegmentBodyCollisionRect(
      from,
      to,
      radius,
      thickness,
      backCollisionOffset,
      mapHeight
    ),
    mapWidth,
    mapHeight,
    feature.id,
    `${segmentId}_body`,
    "body"
  );
}

function createWallSegmentCollisionRect(
  from: { x: number; y: number },
  to: { x: number; y: number },
  radius: number,
  thickness: number,
  backCollisionOffset: number,
  mapHeight: number
): { x: number; y: number; width: number; height: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const isHorizontalWallFace = Math.abs(dy) <= Math.max(1, thickness * 0.25);
  const isVerticalWallSide = Math.abs(dx) <= Math.max(1, thickness * 0.25);
  const padding = Math.max(thickness * 0.5, Math.min(radius, thickness));

  if (isHorizontalWallFace) {
    const targetY = (from.y + to.y) / 2 + backCollisionOffset;
    const y =
      targetY + thickness * 0.5 > mapHeight
        ? mapHeight - thickness
        : targetY - thickness * 0.5;
    return {
      x: Math.min(from.x, to.x) - padding,
      y,
      width: Math.abs(dx) + padding * 2,
      height: thickness,
    };
  }

  if (isVerticalWallSide) {
    return {
      x: (from.x + to.x) / 2 - thickness * 0.5,
      y: Math.min(from.y, to.y) - padding,
      width: thickness,
      height: Math.abs(dy) + padding * 2,
    };
  }

  return {
    x: Math.min(from.x, to.x) - padding,
    y: Math.min(from.y, to.y) - padding,
    width: Math.abs(dx) + padding * 2,
    height: Math.abs(dy) + padding * 2,
  };
}

function createWallSegmentBodyCollisionRect(
  from: { x: number; y: number },
  to: { x: number; y: number },
  radius: number,
  thickness: number,
  backCollisionOffset: number,
  mapHeight: number
): { x: number; y: number; width: number; height: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const padding = Math.max(thickness * 0.5, radius);
  const isHorizontalWallFace = Math.abs(dy) <= Math.max(1, thickness * 0.25);
  const isVerticalWallSide = Math.abs(dx) <= Math.max(1, thickness * 0.25);

  if (isHorizontalWallFace) {
    const { top, bottom } = resolveWallBodyVerticalExtent(
      from,
      to,
      radius,
      thickness,
      backCollisionOffset,
      mapHeight
    );
    return {
      x: Math.min(from.x, to.x) - padding,
      y: top,
      width: Math.abs(dx) + padding * 2,
      height: Math.max(thickness, bottom - top),
    };
  }

  if (isVerticalWallSide) {
    const { top, bottom } = resolveWallBodyVerticalExtent(
      from,
      to,
      radius,
      thickness,
      backCollisionOffset,
      mapHeight
    );
    return {
      x: (from.x + to.x) / 2 - padding,
      y: top,
      width: padding * 2,
      height: Math.max(thickness, bottom - top),
    };
  }

  const { top, bottom } = resolveWallBodyVerticalExtent(
    from,
    to,
    radius,
    thickness,
    backCollisionOffset,
    mapHeight
  );
  return {
    x: Math.min(from.x, to.x) - padding,
    y: top,
    width: Math.abs(dx) + padding * 2,
    height: Math.max(thickness, bottom - top),
  };
}

function resolveWallBodyVerticalExtent(
  from: { x: number; y: number },
  to: { x: number; y: number },
  radius: number,
  thickness: number,
  backCollisionOffset: number,
  mapHeight: number
): { top: number; bottom: number } {
  const maskBottom = Math.max(from.y, to.y) + radius;
  const bottom = Math.min(mapHeight, maskBottom + backCollisionOffset);
  const bodyDepth = Math.max(thickness, Math.min(radius, backCollisionOffset));
  return {
    top: Math.min(bottom - thickness, bottom - bodyDepth),
    bottom,
  };
}

function pushWallCollisionRect(
  polygons: StudioCollisionPolygon[],
  rect: { x: number; y: number; width: number; height: number },
  mapWidth: number,
  mapHeight: number,
  sourceId: string,
  segmentId: string,
  role = "edge"
): void {
  const clamped = clampPixelRect(rect, mapWidth, mapHeight);
  if (!clamped) return;
  polygons.push(pixelRectToPolygon(clamped, "morphology_wall_edge_collision", sourceId, segmentId, role));
}

function clampPixelRect(
  rect: { x: number; y: number; width: number; height: number },
  mapWidth: number,
  mapHeight: number
): { x: number; y: number; width: number; height: number } | null {
  if (rect.width <= 0 || rect.height <= 0 || mapWidth <= 0 || mapHeight <= 0) return null;
  const x = Math.max(0, Math.min(mapWidth, rect.x));
  const y = Math.max(0, Math.min(mapHeight, rect.y));
  const right = Math.max(x, Math.min(mapWidth, rect.x + rect.width));
  const bottom = Math.max(y, Math.min(mapHeight, rect.y + rect.height));
  if (right - x < 1 || bottom - y < 1) return null;
  return { x, y, width: right - x, height: bottom - y };
}

function pixelRectToPolygon(
  rect: { x: number; y: number; width: number; height: number },
  type: StudioCollisionPolygon["type"],
  sourceId: string,
  segmentId: string,
  role?: string
): StudioCollisionPolygon {
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  return {
    id: `${type}_${sourceId}_${segmentId}_${x}_${y}`,
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
      segment: segmentId,
      ...(role ? { role } : {}),
    },
  };
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
