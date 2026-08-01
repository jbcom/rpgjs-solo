import { Vector2 } from "@rpgjs/common";
import type {
  ClientProjectileImpact,
  ClientProjectileSpawn,
} from "./ProjectileManager";

/**
 * Predict an impact with the same ray/capsule primitive and owner filter used
 * by the authoritative projectile system. The server remains authoritative.
 */
export const predictClientProjectileImpact = (
  physic: any,
  projectile: ClientProjectileSpawn,
): ClientProjectileImpact | null => {
  if (
    projectile.predictImpact === false
    || !physic
    || !Number.isFinite(projectile.range)
    || projectile.range <= 0
  ) {
    return null;
  }
  const origin = projectile.origin;
  const direction = projectile.direction;
  if (
    !origin
    || !direction
    || !Number.isFinite(origin.x)
    || !Number.isFinite(origin.y)
    || !Number.isFinite(direction.x)
    || !Number.isFinite(direction.y)
    || (direction.x === 0 && direction.y === 0)
  ) {
    return null;
  }

  const originVector = new Vector2(origin.x, origin.y);
  const directionVector = new Vector2(direction.x, direction.y);
  const filter = (entity: { uuid?: string }) =>
    projectile.ignoreOwner === false
    || !projectile.ownerId
    || entity.uuid !== projectile.ownerId;
  const radius = Number(projectile.radius);
  const hit = Number.isFinite(radius) && radius > 0
    && typeof physic.capsuleCast === "function"
    ? physic.capsuleCast(
        originVector,
        directionVector,
        projectile.range,
        radius,
        projectile.collisionMask,
        filter,
      )
    : physic.raycast(
        originVector,
        directionVector,
        projectile.range,
        projectile.collisionMask,
        filter,
      );
  if (!hit) return null;
  return {
    id: projectile.id,
    targetId: hit.entity.uuid,
    x: hit.point.x,
    y: hit.point.y,
    distance: hit.distance,
  };
};
