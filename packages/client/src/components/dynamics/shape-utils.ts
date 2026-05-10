const defaultToNumber = (value: any, fallback = 0) => {
  const num = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(num) ? num : fallback;
};

export function getShapePointBounds(points: any[] = [], toNumber = defaultToNumber) {
  if (!Array.isArray(points) || points.length < 2) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < points.length; i += 2) {
    const x = toNumber(points[i], 0);
    const y = toNumber(points[i + 1], 0);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return { minX, minY, maxX, maxY };
}

export function getShapeBox(cfg: any, toNumber = defaultToNumber) {
  if (cfg.type === 'circle') {
    return { width: cfg.radius * 2, height: cfg.radius * 2, offsetX: 0, offsetY: 0 };
  }

  if (cfg.type === 'line') {
    const minX = Math.min(cfg.x1, cfg.x2);
    const minY = Math.min(cfg.y1, cfg.y2);
    const maxX = Math.max(cfg.x1, cfg.x2);
    const maxY = Math.max(cfg.y1, cfg.y2);
    return {
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
      offsetX: -minX,
      offsetY: -minY
    };
  }

  if (cfg.type === 'polygon') {
    const bounds = getShapePointBounds(cfg.points, toNumber);
    return {
      width: Math.max(1, bounds.maxX - bounds.minX),
      height: Math.max(1, bounds.maxY - bounds.minY),
      offsetX: -bounds.minX,
      offsetY: -bounds.minY
    };
  }

  return { width: cfg.width, height: cfg.height, offsetX: 0, offsetY: 0 };
}

export function translatePolygonPoints(points: any[] = [], box: { offsetX: number; offsetY: number }, toNumber = defaultToNumber) {
  return points.map((point, index) => toNumber(point, 0) + (index % 2 === 0 ? box.offsetX : box.offsetY));
}
