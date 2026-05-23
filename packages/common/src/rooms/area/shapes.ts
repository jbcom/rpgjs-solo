import {
  boundsFromCenter,
  distance,
  maxDistanceFromBounds,
  offsetCenter,
  pointInRect,
  rectsIntersect,
  rotatePoint,
} from "./utils";
import type {
  AreaShapeCircleOptions,
  AreaShapeCrossOptions,
  AreaShapeCustomOptions,
  AreaShapeLineOptions,
  AreaShapeRectOptions,
  MapAreaShape,
} from "./types";

const angleFromDirection = (
  direction: AreaShapeLineOptions["direction"]
): number => {
  if (typeof direction !== "string") {
    return Math.atan2(direction.y, direction.x);
  }
  switch (direction) {
    case "up":
      return -Math.PI / 2;
    case "down":
      return Math.PI / 2;
    case "left":
      return Math.PI;
    case "right":
    default:
      return 0;
  }
};

export const AreaShape = {
  custom<TTarget = unknown>(options: AreaShapeCustomOptions<TTarget>): MapAreaShape<TTarget> {
    return options;
  },

  circle(options: AreaShapeCircleOptions): MapAreaShape {
    return {
      bounds: ({ center }) => {
        const shapeCenter = offsetCenter(center, options.offset);
        return {
          x: shapeCenter.x - options.radius,
          y: shapeCenter.y - options.radius,
          width: options.radius * 2,
          height: options.radius * 2,
        };
      },
      contains: (target, { center }) => {
        const shapeCenter = offsetCenter(center, options.offset);
        const closestX = Math.max(
          target.bounds.x,
          Math.min(shapeCenter.x, target.bounds.x + target.bounds.width)
        );
        const closestY = Math.max(
          target.bounds.y,
          Math.min(shapeCenter.y, target.bounds.y + target.bounds.height)
        );
        return distance(shapeCenter, { x: closestX, y: closestY }) <= options.radius;
      },
      distance: (target, { center }) =>
        distance(offsetCenter(center, options.offset), target),
      maxDistance: () => options.radius,
    };
  },

  rect(options: AreaShapeRectOptions): MapAreaShape {
    const angle = options.angle ?? 0;
    return {
      bounds: ({ center }) => {
        const shapeCenter = offsetCenter(center, options.offset);
        if (angle === 0) {
          return boundsFromCenter(shapeCenter, options.width, options.height);
        }
        const halfWidth = options.width / 2;
        const halfHeight = options.height / 2;
        const corners = [
          rotatePoint({ x: -halfWidth, y: -halfHeight }, angle),
          rotatePoint({ x: halfWidth, y: -halfHeight }, angle),
          rotatePoint({ x: -halfWidth, y: halfHeight }, angle),
          rotatePoint({ x: halfWidth, y: halfHeight }, angle),
        ];
        const minX = Math.min(...corners.map((corner) => corner.x));
        const maxX = Math.max(...corners.map((corner) => corner.x));
        const minY = Math.min(...corners.map((corner) => corner.y));
        const maxY = Math.max(...corners.map((corner) => corner.y));
        return {
          x: shapeCenter.x + minX,
          y: shapeCenter.y + minY,
          width: maxX - minX,
          height: maxY - minY,
        };
      },
      contains: (target, { center }) => {
        const shapeCenter = offsetCenter(center, options.offset);
        if (angle === 0) {
          const rect = boundsFromCenter(shapeCenter, options.width, options.height);
          if (target.bounds.width <= 0 || target.bounds.height <= 0) {
            return pointInRect(target, rect);
          }
          return rectsIntersect(rect, target.bounds);
        }
        const local = rotatePoint(
          { x: target.x - shapeCenter.x, y: target.y - shapeCenter.y },
          -angle
        );
        return (
          Math.abs(local.x) <= options.width / 2 &&
          Math.abs(local.y) <= options.height / 2
        );
      },
      distance: (target, { center }) =>
        distance(offsetCenter(center, options.offset), target),
      maxDistance: () => Math.hypot(options.width / 2, options.height / 2),
    };
  },

  line(options: AreaShapeLineOptions): MapAreaShape {
    return this.rect({
      width: options.length,
      height: options.thickness,
      offset: options.offset,
      angle: angleFromDirection(options.direction),
    });
  },

  cross(options: AreaShapeCrossOptions): MapAreaShape {
    return this.composite([
      this.rect({
        width: options.armLength * 2 + options.thickness,
        height: options.thickness,
        offset: options.offset,
      }),
      this.rect({
        width: options.thickness,
        height: options.armLength * 2 + options.thickness,
        offset: options.offset,
      }),
    ]);
  },

  composite<TTarget = unknown>(shapes: MapAreaShape<TTarget>[]): MapAreaShape<TTarget> {
    return {
      bounds: (ctx) => {
        const bounds = shapes.map((shape) => shape.bounds(ctx));
        const minX = Math.min(...bounds.map((bound) => bound.x));
        const minY = Math.min(...bounds.map((bound) => bound.y));
        const maxX = Math.max(...bounds.map((bound) => bound.x + bound.width));
        const maxY = Math.max(...bounds.map((bound) => bound.y + bound.height));
        return {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
        };
      },
      contains: (target, ctx) =>
        shapes.some((shape) => shape.contains(target, ctx)),
      distance: (target, ctx) =>
        Math.min(
          ...shapes.map((shape) => shape.distance?.(target, ctx) ?? distance(ctx.center, target))
        ),
      maxDistance: (ctx) =>
        Math.max(
          ...shapes.map((shape) => shape.maxDistance?.(ctx) ?? maxDistanceFromBounds(ctx.center, shape.bounds(ctx)))
        ),
    };
  },
};
