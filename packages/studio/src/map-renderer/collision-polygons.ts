import {
  type StudioCollisionPolygon,
  type StudioTerrainMorphologyFeature,
} from "./types";
import { createStudioTerrainRenderData } from "./map-normalizer";

interface BooleanMask {
  width: number;
  height: number;
  cells: boolean[][];
}

interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

export function buildStudioTerrainCollisionPolygons(map: any): StudioCollisionPolygon[] {
  const data = createStudioTerrainRenderData(map);
  const alwaysLowElementRects = resolveAlwaysLowElementWalkableRects(map, data.width, data.height);
  const terrainMask = createEmptyMask(data.widthTiles, data.heightTiles);

  for (let y = 0; y < data.heightTiles; y += 1) {
    for (let x = 0; x < data.widthTiles; x += 1) {
      terrainMask.cells[y][x] = data.terrainGrid[y]?.[x]?.collision === true;
    }
  }

  const polygons = pixelRectanglesToPolygons(
    subtractRects(maskRectanglesToPixelRects(maskToRectangles(terrainMask), data.tileSize), alwaysLowElementRects),
    "terrain_collision",
    "terrain",
    data.tileSize
  );

  data.morphologyFeatures.forEach((feature) => {
    if (feature.kind === "wall") {
      polygons.push(...createWallMorphologyCollisionPolygons(
        feature,
        data.width,
        data.height,
        data.tileSize,
        alwaysLowElementRects
      ));
      return;
    }

    polygons.push(...createHoleMorphologyCollisionPolygons(
      feature,
      data.width,
      data.height,
      data.tileSize,
      alwaysLowElementRects
    ));
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

function resolveWallBackCollisionOffset(feature: StudioTerrainMorphologyFeature, tileSize: number): number {
  const explicitOffset = Number(feature.params.backCollisionOffset ?? feature.params.collisionOffsetY);
  if (Number.isFinite(explicitOffset) && explicitOffset >= 0) {
    return Math.min(tileSize * 4, explicitOffset);
  }

  const wallHeight = Number(feature.params.height);
  const resolvedHeight = Number.isFinite(wallHeight) && wallHeight > 0 ? wallHeight : tileSize;
  return Math.max(tileSize * 0.45, Math.min(tileSize * 4, resolvedHeight));
}

function createHoleMorphologyCollisionPolygons(
  feature: StudioTerrainMorphologyFeature,
  mapWidth: number,
  mapHeight: number,
  tileSize: number,
  clearRects: PixelRect[]
): StudioCollisionPolygon[] {
  const thickness = resolveHoleCollisionThickness(feature, tileSize);
  const polygons: StudioCollisionPolygon[] = [];

  feature.strokes.forEach((stroke) => {
    const points = normalizeStrokePoints(stroke.points);
    const radius = resolveHoleCollisionRadius(stroke.radius, feature.params);
    if (points.length === 0) return;
    if (points.length === 1) {
      pushArcCollisionPolygons(
        polygons,
        points[0],
        radius,
        thickness,
        0,
        Math.PI * 2,
        mapWidth,
        mapHeight,
        feature.id,
        `${stroke.id}_cap`,
        clearRects
      );
      return;
    }

    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1];
      const to = points[index];
      const segmentId = `${stroke.id}_${index}`;
      pushHoleSegmentCollisionPolygon(
        polygons,
        from,
        to,
        radius,
        thickness,
        1,
        mapWidth,
        mapHeight,
        feature.id,
        `${segmentId}_left`,
        clearRects
      );
      pushHoleSegmentCollisionPolygon(
        polygons,
        from,
        to,
        radius,
        thickness,
        -1,
        mapWidth,
        mapHeight,
        feature.id,
        `${segmentId}_right`,
        clearRects
      );
    }

    pushHoleStrokeCapsAndJoints(
      polygons,
      points,
      radius,
      thickness,
      mapWidth,
      mapHeight,
      feature.id,
      stroke.id,
      clearRects
    );
  });

  return polygons;
}

function resolveHoleCollisionThickness(feature: StudioTerrainMorphologyFeature, tileSize: number): number {
  const explicitThickness = Number(feature.params.collisionThickness ?? feature.params.edgeCollisionWidth);
  if (Number.isFinite(explicitThickness) && explicitThickness > 0) {
    return Math.min(tileSize * 0.6, explicitThickness);
  }
  return Math.max(8, Math.min(tileSize * 0.28, 14));
}

function resolveHoleCollisionRadius(radius: number, params: StudioTerrainMorphologyFeature["params"]): number {
  const explicitRadius = Number(params.collisionRadius);
  if (Number.isFinite(explicitRadius) && explicitRadius > 0) {
    return explicitRadius;
  }
  const smoothness = 1 - clampNumber(Number(params.roughness ?? 0), 0, 1);
  const roughness = (1 - smoothness) * 0.3;
  return Math.max(1, radius * (1 + roughness * 0.08));
}

function pushHoleSegmentCollisionPolygon(
  polygons: StudioCollisionPolygon[],
  from: Point,
  to: Point,
  radius: number,
  thickness: number,
  side: 1 | -1,
  mapWidth: number,
  mapHeight: number,
  sourceId: string,
  segmentId: string,
  clearRects: PixelRect[]
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return;

  const tangent = { x: dx / length, y: dy / length };
  const normal = { x: (-dy / length) * side, y: (dx / length) * side };
  const inner = Math.max(0, radius - thickness * 0.5);
  const outer = radius + thickness * 0.5;
  const extension = Math.min(thickness * 0.5, length * 0.2);
  const start = { x: from.x - tangent.x * extension, y: from.y - tangent.y * extension };
  const end = { x: to.x + tangent.x * extension, y: to.y + tangent.y * extension };

  pushHolePolygon(
    polygons,
    [
      offsetPoint(start, normal, inner),
      offsetPoint(end, normal, inner),
      offsetPoint(end, normal, outer),
      offsetPoint(start, normal, outer),
    ],
    mapWidth,
    mapHeight,
    sourceId,
    segmentId,
    clearRects
  );
}

function pushHoleStrokeCapsAndJoints(
  polygons: StudioCollisionPolygon[],
  points: Point[],
  radius: number,
  thickness: number,
  mapWidth: number,
  mapHeight: number,
  sourceId: string,
  strokeId: string,
  clearRects: PixelRect[]
): void {
  const firstDirection = segmentAngle(points[0], points[1]);
  const lastDirection = segmentAngle(points[points.length - 2], points[points.length - 1]);
  pushArcCollisionPolygons(
    polygons,
    points[0],
    radius,
    thickness,
    firstDirection + Math.PI * 0.5,
    firstDirection + Math.PI * 1.5,
    mapWidth,
    mapHeight,
    sourceId,
    `${strokeId}_start_cap`,
    clearRects
  );
  pushArcCollisionPolygons(
    polygons,
    points[points.length - 1],
    radius,
    thickness,
    lastDirection - Math.PI * 0.5,
    lastDirection + Math.PI * 0.5,
    mapWidth,
    mapHeight,
    sourceId,
    `${strokeId}_end_cap`,
    clearRects
  );

  for (let index = 1; index < points.length - 1; index += 1) {
    const previousAngle = segmentAngle(points[index - 1], points[index]);
    const nextAngle = segmentAngle(points[index], points[index + 1]);
    pushShortestArcCollisionPolygons(
      polygons,
      points[index],
      radius,
      thickness,
      previousAngle + Math.PI * 0.5,
      nextAngle + Math.PI * 0.5,
      mapWidth,
      mapHeight,
      sourceId,
      `${strokeId}_${index}_left_joint`,
      clearRects
    );
    pushShortestArcCollisionPolygons(
      polygons,
      points[index],
      radius,
      thickness,
      previousAngle - Math.PI * 0.5,
      nextAngle - Math.PI * 0.5,
      mapWidth,
      mapHeight,
      sourceId,
      `${strokeId}_${index}_right_joint`,
      clearRects
    );
  }
}

function pushShortestArcCollisionPolygons(
  polygons: StudioCollisionPolygon[],
  center: Point,
  radius: number,
  thickness: number,
  startAngle: number,
  endAngle: number,
  mapWidth: number,
  mapHeight: number,
  sourceId: string,
  segmentId: string,
  clearRects: PixelRect[]
): void {
  const delta = normalizeSignedAngle(endAngle - startAngle);
  if (Math.abs(delta) < 0.02) return;
  pushArcCollisionPolygons(
    polygons,
    center,
    radius,
    thickness,
    startAngle,
    startAngle + delta,
    mapWidth,
    mapHeight,
    sourceId,
    segmentId,
    clearRects
  );
}

function pushArcCollisionPolygons(
  polygons: StudioCollisionPolygon[],
  center: Point,
  radius: number,
  thickness: number,
  startAngle: number,
  endAngle: number,
  mapWidth: number,
  mapHeight: number,
  sourceId: string,
  segmentId: string,
  clearRects: PixelRect[]
): void {
  const inner = Math.max(0, radius - thickness * 0.5);
  const outer = radius + thickness * 0.5;
  const sweep = endAngle - startAngle;
  const steps = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 8)));

  for (let step = 0; step < steps; step += 1) {
    const angleA = startAngle + (sweep * step) / steps;
    const angleB = startAngle + (sweep * (step + 1)) / steps;
    pushHolePolygon(
      polygons,
      [
        pointOnCircle(center, inner, angleA),
        pointOnCircle(center, inner, angleB),
        pointOnCircle(center, outer, angleB),
        pointOnCircle(center, outer, angleA),
      ],
      mapWidth,
      mapHeight,
      sourceId,
      `${segmentId}_${step}`,
      clearRects
    );
  }
}

function pushHolePolygon(
  polygons: StudioCollisionPolygon[],
  points: Point[],
  mapWidth: number,
  mapHeight: number,
  sourceId: string,
  segmentId: string,
  clearRects: PixelRect[]
): void {
  const clippedPoints = clampPolygonPoints(points, mapWidth, mapHeight);
  if (clippedPoints.length < 3 || Math.abs(polygonArea(clippedPoints)) < 1) return;
  if (polygonIntersectsAnyRect(clippedPoints, clearRects)) return;
  polygons.push(pointsToCollisionPolygon(
    clippedPoints,
    "morphology_hole_edge_collision",
    sourceId,
    segmentId,
    "edge"
  ));
}

function pointsToCollisionPolygon(
  points: Point[],
  type: StudioCollisionPolygon["type"],
  sourceId: string,
  segmentId: string,
  role?: string
): StudioCollisionPolygon {
  const roundedPoints = points.map((point) => [Math.round(point.x), Math.round(point.y)] as [number, number]);
  const xs = roundedPoints.map((point) => point[0]);
  const ys = roundedPoints.map((point) => point[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const width = Math.max(1, Math.max(...xs) - x);
  const height = Math.max(1, Math.max(...ys) - y);
  return {
    id: `${type}_${sourceId}_${segmentId}_${x}_${y}`,
    type,
    x,
    y,
    width,
    height,
    points: roundedPoints,
    properties: {
      source: sourceId,
      segment: segmentId,
      ...(role ? { role } : {}),
    },
  };
}

function createWallMorphologyCollisionPolygons(
  feature: StudioTerrainMorphologyFeature,
  mapWidth: number,
  mapHeight: number,
  tileSize: number,
  clearRects: PixelRect[]
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
        stroke.id,
        clearRects
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
        stroke.id,
        clearRects
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
        segmentId,
        clearRects
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
        segmentId,
        clearRects
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
  segmentId: string,
  clearRects: PixelRect[]
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
    clearRects,
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
  clearRects: PixelRect[],
  role = "edge"
): void {
  const clamped = clampPixelRect(rect, mapWidth, mapHeight);
  if (!clamped) return;
  subtractRects([clamped], clearRects).forEach((remainingRect) => {
    polygons.push(pixelRectToPolygon(remainingRect, "morphology_wall_edge_collision", sourceId, segmentId, role));
  });
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

function maskRectanglesToPixelRects(
  rectangles: Array<{ x: number; y: number; width: number; height: number }>,
  tileSize: number
): PixelRect[] {
  return rectangles.map((rect) => ({
    x: rect.x * tileSize,
    y: rect.y * tileSize,
    width: rect.width * tileSize,
    height: rect.height * tileSize,
  }));
}

function pixelRectanglesToPolygons(
  rectangles: PixelRect[],
  type: StudioCollisionPolygon["type"],
  sourceId: string,
  tileSize: number
): StudioCollisionPolygon[] {
  return rectangles.map((rect, index) => {
    const polygon = pixelRectToPolygon(rect, type, sourceId, String(index));
    polygon.properties = {
      ...polygon.properties,
      tileX: rect.x / tileSize,
      tileY: rect.y / tileSize,
      tileWidth: rect.width / tileSize,
      tileHeight: rect.height / tileSize,
    };
    return polygon;
  });
}

function subtractRects(rects: PixelRect[], clearRects: PixelRect[]): PixelRect[] {
  if (rects.length === 0 || clearRects.length === 0) return rects;

  return clearRects.reduce((remaining, clearRect) => {
    return remaining.flatMap((rect) => subtractRect(rect, clearRect));
  }, rects);
}

function subtractRect(rect: PixelRect, clearRect: PixelRect): PixelRect[] {
  const left = Math.max(rect.x, clearRect.x);
  const top = Math.max(rect.y, clearRect.y);
  const right = Math.min(rect.x + rect.width, clearRect.x + clearRect.width);
  const bottom = Math.min(rect.y + rect.height, clearRect.y + clearRect.height);

  if (right <= left || bottom <= top) return [rect];

  const pieces: PixelRect[] = [];
  const rectRight = rect.x + rect.width;
  const rectBottom = rect.y + rect.height;

  if (top > rect.y) {
    pieces.push({ x: rect.x, y: rect.y, width: rect.width, height: top - rect.y });
  }

  if (bottom < rectBottom) {
    pieces.push({ x: rect.x, y: bottom, width: rect.width, height: rectBottom - bottom });
  }

  if (left > rect.x) {
    pieces.push({ x: rect.x, y: top, width: left - rect.x, height: bottom - top });
  }

  if (right < rectRight) {
    pieces.push({ x: right, y: top, width: rectRight - right, height: bottom - top });
  }

  return pieces.filter((piece) => piece.width >= 1 && piece.height >= 1);
}

function normalizeStrokePoints(points: Point[]): Point[] {
  return points.reduce<Point[]>((normalized, point) => {
    const previous = normalized[normalized.length - 1];
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= 1) {
      normalized.push(point);
    }
    return normalized;
  }, []);
}

function offsetPoint(point: Point, normal: Point, distance: number): Point {
  return {
    x: point.x + normal.x * distance,
    y: point.y + normal.y * distance,
  };
}

function pointOnCircle(center: Point, radius: number, angle: number): Point {
  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius,
  };
}

function segmentAngle(from: Point, to: Point): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function normalizeSignedAngle(angle: number): number {
  let normalized = angle;
  while (normalized <= -Math.PI) normalized += Math.PI * 2;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  return normalized;
}

function clampPolygonPoints(points: Point[], mapWidth: number, mapHeight: number): Point[] {
  const unique = new Set<string>();
  const clamped: Point[] = [];

  points.forEach((point) => {
    const x = Math.max(0, Math.min(mapWidth, point.x));
    const y = Math.max(0, Math.min(mapHeight, point.y));
    const key = `${Math.round(x * 1000)}:${Math.round(y * 1000)}`;
    if (unique.has(key)) return;
    unique.add(key);
    clamped.push({ x, y });
  });

  return clamped;
}

function polygonArea(points: Point[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area * 0.5;
}

function polygonCentroid(points: Point[]): Point {
  const area = polygonArea(points);
  if (Math.abs(area) < 0.0001) {
    return {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    };
  }

  let x = 0;
  let y = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const factor = current.x * next.y - next.x * current.y;
    x += (current.x + next.x) * factor;
    y += (current.y + next.y) * factor;
  }

  return {
    x: x / (6 * area),
    y: y / (6 * area),
  };
}

function polygonIntersectsAnyRect(points: Point[], rects: PixelRect[]): boolean {
  if (rects.length === 0) return false;
  const centroid = polygonCentroid(points);
  return rects.some((rect) => (
    isPointInsideRect(centroid, rect) ||
    points.some((point) => isPointInsideRect(point, rect)) ||
    rectCorners(rect).some((corner) => isPointInPolygon(corner, points)) ||
    polygonEdges(points).some(([from, to]) => rectEdges(rect).some(([rectFrom, rectTo]) => (
      segmentsIntersect(from, to, rectFrom, rectTo)
    )))
  ));
}

function isPointInsideRect(point: Point, rect: PixelRect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function rectCorners(rect: PixelRect): Point[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
}

function polygonEdges(points: Point[]): Array<[Point, Point]> {
  return points.map((point, index) => [point, points[(index + 1) % points.length]]);
}

function rectEdges(rect: PixelRect): Array<[Point, Point]> {
  return polygonEdges(rectCorners(rect));
}

function isPointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
    const current = polygon[index];
    const previous = polygon[previousIndex];
    const intersects = ((current.y > point.y) !== (previous.y > point.y)) &&
      point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(firstA: Point, firstB: Point, secondA: Point, secondB: Point): boolean {
  const d1 = orientation(firstA, firstB, secondA);
  const d2 = orientation(firstA, firstB, secondB);
  const d3 = orientation(secondA, secondB, firstA);
  const d4 = orientation(secondA, secondB, firstB);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  return (
    (d1 === 0 && pointOnSegment(secondA, firstA, firstB)) ||
    (d2 === 0 && pointOnSegment(secondB, firstA, firstB)) ||
    (d3 === 0 && pointOnSegment(firstA, secondA, secondB)) ||
    (d4 === 0 && pointOnSegment(firstB, secondA, secondB))
  );
}

function orientation(a: Point, b: Point, c: Point): number {
  const value = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return Math.abs(value) < 0.0001 ? 0 : value;
}

function pointOnSegment(point: Point, from: Point, to: Point): boolean {
  return (
    point.x >= Math.min(from.x, to.x) - 0.0001 &&
    point.x <= Math.max(from.x, to.x) + 0.0001 &&
    point.y >= Math.min(from.y, to.y) - 0.0001 &&
    point.y <= Math.max(from.y, to.y) + 0.0001
  );
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function resolveAlwaysLowElementWalkableRects(map: any, mapWidth: number, mapHeight: number): PixelRect[] {
  const elementsAlwaysLow = parseArray(map?.elementsAlwaysLow);
  if (elementsAlwaysLow.length === 0) return [];

  const tilesets = normalizeTilesets([
    map?.params?.tileset,
    map?.params?.primaryElementTileset,
    ...normalizeTilesets(map?.params?.elementTilesets),
  ]);
  const tilesetsById = new Map<string, any>();
  tilesets.forEach((tileset) => {
    const tilesetId = toIdentifierString(tileset?._id) || toIdentifierString(tileset?.id);
    if (tilesetId) tilesetsById.set(tilesetId, tileset);
  });

  const fallbackTileset = tilesets[0];

  return elementsAlwaysLow
    .map((element) => resolveElementRect(element, tilesetsById, fallbackTileset))
    .filter((rect): rect is PixelRect => rect !== null)
    .map((rect) => clampPixelRect(rect, mapWidth, mapHeight))
    .filter((rect): rect is PixelRect => rect !== null);
}

function resolveElementRect(
  element: any,
  tilesetsById: Map<string, any>,
  fallbackTileset: any
): PixelRect | null {
  const x = toFiniteNumber(element?.x);
  const y = toFiniteNumber(element?.y);
  if (x === null || y === null) return null;

  const tilesetId = toIdentifierString(element?.tilesetId);
  const tileset = (tilesetId ? tilesetsById.get(tilesetId) : null) || fallbackTileset;
  const tilesetElement = resolveTilesetElement(tileset, element?.id);
  const sourceRect = Array.isArray(tilesetElement?.rect) ? tilesetElement.rect : null;
  const sourceWidth = sourceRect ? toFiniteNumber(sourceRect[2]) : null;
  const sourceHeight = sourceRect ? toFiniteNumber(sourceRect[3]) : null;
  const width = normalizeDimension(element?.width, sourceWidth);
  const height = normalizeDimension(element?.height, sourceHeight);
  if (width === null || height === null || width <= 0 || height <= 0) return null;

  const scale = resolveScale(element?.scale ?? tilesetElement?.scale);
  return {
    x,
    y,
    width: width * scale.x,
    height: height * scale.y,
  };
}

function resolveTilesetElement(tileset: any, elementId: unknown): any | null {
  if (!tileset || elementId === undefined || elementId === null) return null;
  const elements = parseArray(tileset?.metadata?.elements);
  const key = String(elementId);
  return elements.find((element, index) => String(element?.id ?? index) === key || String(index) === key) ?? null;
}

function normalizeDimension(value: unknown, fallback: number | null): number | null {
  const resolved = toFiniteNumber(value);
  if (resolved !== null && resolved > 0) return resolved;
  return fallback !== null && fallback > 0 ? fallback : null;
}

function resolveScale(value: unknown): { x: number; y: number } {
  if (Array.isArray(value)) {
    const x = toFiniteNumber(value[0]) ?? 1;
    const y = toFiniteNumber(value[1]) ?? x;
    return { x: x > 0 ? x : 1, y: y > 0 ? y : 1 };
  }

  if (typeof value === "number") {
    return { x: value > 0 ? value : 1, y: value > 0 ? value : 1 };
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const x = toFiniteNumber(record.x) ?? 1;
    const y = toFiniteNumber(record.y) ?? x;
    return { x: x > 0 ? x : 1, y: y > 0 ? y : 1 };
  }

  return { x: 1, y: 1 };
}

function normalizeTilesets(value: unknown): any[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeTilesets(entry));
  }
  return typeof value === "object" ? [value] : [];
}

function parseArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toFiniteNumber(value: unknown): number | null {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numberValue) ? numberValue : null;
}

function toIdentifierString(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    const normalized = String(value).trim();
    return normalized.startsWith("#") ? normalized.slice(1) : normalized;
  }

  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return (
    toIdentifierString(record.$oid) ||
    toIdentifierString(record.oid) ||
    toIdentifierString(record._id) ||
    toIdentifierString(record.id) ||
    toIdentifierString(record.value) ||
    toIdentifierString(record.uuid)
  );
}
