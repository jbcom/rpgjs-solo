export const DEFAULT_HP_BAR_STYLE = { fillColor: '#ef4444' };
export const DEFAULT_SP_BAR_STYLE = { fillColor: '#3b82f6' };

const DEFAULT_CELL_HEIGHT = 16;
const DEFAULT_CELL_WIDTH = 32;

type NumberResolver = (value: any, fallback?: number) => number;

const defaultToNumber: NumberResolver = (value, fallback = 0) => {
  const num = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(num) ? num : fallback;
};

export function getPointBounds(points: any[] = [], toNumber: NumberResolver = defaultToNumber) {
  if (!Array.isArray(points) || points.length < 2) {
    return { width: 1, height: 1 };
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

  return {
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
}

export function getComponentId(definition: any) {
  if (!definition) return undefined;
  if (definition.id) return definition.id;
  if (definition.type === 'text') return 'rpg:text';
  if (definition.type === 'hpBar') return 'rpg:hpBar';
  if (definition.type === 'spBar') return 'rpg:spBar';
  if (definition.type === 'bar') return 'rpg:bar';
  if (definition.type === 'shape') return 'rpg:shape';
  if (definition.type === 'image') return 'rpg:image';
  if (definition.type === 'tile') return 'rpg:tile';
  return definition.type;
}

export function getComponentProps(definition: any) {
  if (definition.props) return definition.props;

  if (definition.type === 'text') {
    return { value: definition.value, style: definition.style };
  }
  if (definition.type === 'hpBar') {
    return { current: '{hp}', max: '{param.maxHp}', style: { ...DEFAULT_HP_BAR_STYLE, ...definition.style }, text: definition.text };
  }
  if (definition.type === 'spBar') {
    return { current: '{sp}', max: '{param.maxSp}', style: { ...DEFAULT_SP_BAR_STYLE, ...definition.style }, text: definition.text };
  }
  if (definition.type === 'bar') {
    return { current: `{${definition.current}}`, max: `{${definition.max}}`, style: definition.style, text: definition.text };
  }
  if (definition.type === 'shape') {
    return definition.value;
  }
  if (definition.type === 'image' || definition.type === 'tile') {
    return { value: definition.value };
  }

  return {};
}

export function estimateComponentSize(
  definition: any,
  {
    toNumber = defaultToNumber,
    estimateTextWidth = (value: any) => String(value ?? '').length * 8
  }: {
    toNumber?: NumberResolver;
    estimateTextWidth?: (value: any, style?: any) => number;
  } = {}
) {
  const props = getComponentProps(definition);
  const style = props?.style ?? definition?.style ?? {};

  if (definition?.type === 'text' || definition?.id === 'rpg:text') {
    return {
      width: estimateTextWidth(props.value ?? definition.value, style),
      height: toNumber(style.fontSize, 12)
    };
  }

  if (definition?.type === 'hpBar' || definition?.type === 'spBar' || definition?.type === 'bar' || definition?.id === 'rpg:hpBar' || definition?.id === 'rpg:spBar' || definition?.id === 'rpg:bar') {
    const barHeight = toNumber(style.height, 8);
    const labelHeight = props.text != null && props.text !== '' ? toNumber(style.fontSize, 10) + 2 : 0;
    return {
      width: toNumber(style.width, 50),
      height: barHeight + labelHeight
    };
  }

  if (definition?.type === 'shape' || definition?.id === 'rpg:shape') {
    const shape = props ?? {};
    if (shape.type === 'circle') {
      const radius = toNumber(shape.radius, 8);
      return { width: radius * 2, height: radius * 2 };
    }
    if (shape.type === 'line') {
      return {
        width: Math.max(1, Math.abs(toNumber(shape.x2, 16) - toNumber(shape.x1, 0))),
        height: Math.max(1, Math.abs(toNumber(shape.y2, 0) - toNumber(shape.y1, 0)))
      };
    }
    if (shape.type === 'polygon') {
      return getPointBounds(shape.points, toNumber);
    }
    return {
      width: toNumber(shape.width, 16),
      height: toNumber(shape.height, 16)
    };
  }

  return {
    width: toNumber(definition?.props?.width, DEFAULT_CELL_WIDTH),
    height: toNumber(definition?.props?.height, DEFAULT_CELL_HEIGHT)
  };
}

export function computeBlockSize({
  position,
  layout = {},
  rowMetrics,
  gap = { row: 0, column: 0 },
  graphic,
  hitbox
}: {
  position: string;
  layout?: any;
  rowMetrics: Array<{ width: number; height: number; cells: any[] }>;
  gap?: { row: number; column: number };
  graphic: { width: number; height: number };
  hitbox: { w: number; h: number };
}) {
  const rowGapTotal = Math.max(0, rowMetrics.length - 1) * gap.row;
  const maxColumns = rowMetrics.reduce((max, row) => Math.max(max, row.cells.length), 0);
  const columnGapTotal = Math.max(0, maxColumns - 1) * gap.column;
  const contentWidth = rowMetrics.reduce((max, row) => Math.max(max, row.width), 0) + columnGapTotal;
  const contentHeight = rowMetrics.reduce((sum, row) => sum + row.height, 0) + rowGapTotal;
  const width = layout.width ?? Math.max(contentWidth, position === 'bottom' ? hitbox.w : position === 'top' || position === 'center' ? graphic.width : contentWidth);
  const height = layout.height ?? Math.max(contentHeight, position === 'bottom' ? hitbox.h : position === 'left' || position === 'right' || position === 'center' ? graphic.height : contentHeight);

  return { width, height };
}

export function computeBlockPosition({
  position,
  size,
  layout = {},
  graphic,
  hitbox
}: {
  position: string;
  size: { width: number; height: number };
  layout?: any;
  graphic: { left: number; top: number; right: number; centerX: number; centerY: number };
  hitbox: { w: number; h: number };
}) {
  const marginLeft = layout.marginLeft ?? 0;
  const marginRight = layout.marginRight ?? 0;
  const marginTop = layout.marginTop ?? 0;
  const marginBottom = layout.marginBottom ?? 0;

  switch (position) {
    case 'bottom':
      return {
        x: (hitbox.w / 2) - (size.width / 2) + marginLeft - marginRight,
        y: (hitbox.h / 2) - (size.height / 2) + marginBottom - marginTop
      };
    case 'center':
      return {
        x: graphic.centerX - (size.width / 2) + marginLeft - marginRight,
        y: graphic.centerY - (size.height / 2) + marginTop - marginBottom
      };
    case 'left':
      return {
        x: graphic.left - size.width + marginLeft - marginRight,
        y: graphic.centerY - (size.height / 2) + marginTop - marginBottom
      };
    case 'right':
      return {
        x: graphic.right + marginLeft - marginRight,
        y: graphic.centerY - (size.height / 2) + marginTop - marginBottom
      };
    case 'top':
    default:
      return {
        x: graphic.centerX - (size.width / 2) + marginLeft - marginRight,
        y: graphic.top - size.height + marginTop - marginBottom
      };
  }
}
