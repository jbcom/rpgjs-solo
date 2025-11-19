import { Vector2 } from '../core/math/Vector2';
import { AABB } from '../core/math/AABB';
import { Collider, CollisionInfo, ContactPoint } from './Collider';
import { Entity } from '../physics/Entity';
import { CircleCollider } from './CircleCollider';
import { AABBCollider } from './AABBCollider';

/**
 * Capsule collider
 * 
 * Represents a capsule shape (pill shape) defined by a line segment and a radius.
 * Useful for character controllers as it handles steps and slopes better than AABBs.
 */
export class CapsuleCollider implements Collider {
    constructor(private entity: Entity) { }

    public getBounds(): AABB {
        const { radius, height } = this.getCapsuleConfig();
        const pos = this.entity.position;

        // Vertical capsule for now (can be rotated later if needed)
        // Height is the total height. The line segment length is height - 2 * radius.
        // If height < 2 * radius, it's a sphere.

        const halfHeight = Math.max(0, height / 2 - radius);

        return new AABB(
            pos.x - radius,
            pos.y - halfHeight - radius,
            pos.x + radius,
            pos.y + halfHeight + radius
        );
    }

    public getEntity(): Entity {
        return this.entity;
    }

    public testCollision(other: Collider): CollisionInfo | null {
        if (other instanceof CircleCollider) {
            return this.testCircle(other);
        } else if (other instanceof AABBCollider) {
            return this.testAABB(other);
        } else if (other instanceof CapsuleCollider) {
            return this.testCapsule(other);
        }

        // Double dispatch for other types
        return other.testCollision(this);
    }

    public getContactPoints(other: Collider): ContactPoint[] {
        // Simplified contact points for now
        const collision = this.testCollision(other);
        return collision ? collision.contacts : [];
    }

    private getCapsuleConfig(): { radius: number; height: number } {
        if (this.entity.capsule) {
            return this.entity.capsule;
        }
        // Fallback or error?
        return { radius: this.entity.radius || 10, height: this.entity.height || 30 };
    }

    private getSegment(): { a: Vector2; b: Vector2 } {
        const { radius, height } = this.getCapsuleConfig();
        const pos = this.entity.position;
        const halfSegment = Math.max(0, height / 2 - radius);

        return {
            a: new Vector2(pos.x, pos.y - halfSegment),
            b: new Vector2(pos.x, pos.y + halfSegment)
        };
    }

    private testCircle(circle: CircleCollider): CollisionInfo | null {
        const seg = this.getSegment();
        const circleCenter = circle.getCenter();
        const circleRadius = circle.getRadius();
        const capRadius = this.getCapsuleConfig().radius;

        const closest = this.closestPointOnSegment(seg.a, seg.b, circleCenter);
        const distSq = closest.distanceToSquared(circleCenter);
        const minDist = capRadius + circleRadius;

        if (distSq > minDist * minDist) {
            return null;
        }

        const dist = Math.sqrt(distSq);
        const normal = dist > 0 ? circleCenter.sub(closest).normalize() : new Vector2(1, 0);
        const depth = minDist - dist;

        return {
            entityA: this.entity,
            entityB: circle.getEntity(),

            // Convention: Normal points from A to B.
            // Here A is Capsule, B is Circle.
            // Vector from closest (on capsule) to center (circle) is B - A.
            // So normal should be (circleCenter - closest).normalized().
            // Wait, if I return normal, it should be the direction to push B out of A?
            // Usually normal points from A to B.
            // Let's stick to: normal points from A to B.
            contacts: [{
                point: closest.add(normal.mul(capRadius)),
                normal: normal,
                depth
            }],
            normal: normal,
            depth
        };
    }


    private testAABB(box: AABBCollider): CollisionInfo | null {
        const seg = this.getSegment();
        const capRadius = this.getCapsuleConfig().radius;
        const boxBounds = box.getBounds();

        // 1. Find closest point on segment to the box (clamped to box bounds)
        // Actually, simpler: closest point on segment to the box is hard.
        // Easier: Closest point on box to the segment.

        // We can treat this as: Distance between Segment and AABB.
        // Or: Expand AABB by radius and test against segment?
        // Expanding AABB by radius gives a rounded box.

        // Let's use a numerical approach or simplified feature test.
        // Find the closest point on the segment to the AABB center? No.

        // Correct approach:
        // The distance between a line segment and an AABB.
        // Clamp segment points to AABB?

        // Let's try: Closest point on segment to the AABB.
        // We can clamp the segment endpoints to the AABB, but that's not enough.

        // Alternative: Test segment against expanded AABB (Minkowski sum approach).
        // AABB expanded by radius is a rounded rectangle.
        // Test if segment intersects rounded rectangle.

        // Let's use a simpler heuristic for now:
        // 1. Clamp segment start/end to box?
        // 2. Find closest point on segment to box center?

        // Better:
        // Iterate Voronoi regions?

        // Let's go with: Closest point on AABB to the segment.
        // We can sample the segment? No.

        // Let's use the "closest point on segment to point" for the box center, 
        // then clamp that point to the box?
        // Not exact but often close enough for games.

        const closestOnSeg = this.closestPointOnSegment(seg.a, seg.b, box.getBounds().getCenter());
        const closestOnBox = boxBounds.clamp(closestOnSeg);

        const distSq = closestOnSeg.distanceToSquared(closestOnBox);

        if (distSq > capRadius * capRadius) {
            return null;
        }

        const dist = Math.sqrt(distSq);
        const normal = dist > 0 ? closestOnBox.sub(closestOnSeg).normalize() : new Vector2(0, 1); // Fallback
        const depth = capRadius - dist;

        return {
            entityA: this.entity,
            entityB: box.getEntity(),
            contacts: [{
                point: closestOnBox,
                normal: normal,
                depth
            }],
            normal: normal,
            depth
        };
    }

    private testCapsule(other: CapsuleCollider): CollisionInfo | null {
        // Segment vs Segment distance
        const segA = this.getSegment();
        const segB = other.getSegment();
        const rA = this.getCapsuleConfig().radius;
        const rB = other.getCapsuleConfig().radius;

        // Closest points between two segments
        const { p1, p2 } = this.closestPointsSegmentSegment(segA.a, segA.b, segB.a, segB.b);

        const distSq = p1.distanceToSquared(p2);
        const minDist = rA + rB;

        if (distSq > minDist * minDist) {
            return null;
        }

        const dist = Math.sqrt(distSq);
        const normal = dist > 0 ? p2.sub(p1).normalize() : new Vector2(1, 0);
        const depth = minDist - dist;

        return {
            entityA: this.entity,
            entityB: other.getEntity(),
            contacts: [{
                point: p1.add(normal.mul(rA)),
                normal: normal,
                depth
            }],
            normal: normal,
            depth
        };
    }

    private closestPointOnSegment(a: Vector2, b: Vector2, p: Vector2): Vector2 {
        const ab = b.sub(a);
        const t = p.sub(a).dot(ab) / ab.dot(ab);
        return a.add(ab.mul(Math.max(0, Math.min(1, t))));
    }

    // http://geomalgorithms.com/a07-_distance.html
    private closestPointsSegmentSegment(p1: Vector2, p2: Vector2, p3: Vector2, p4: Vector2): { p1: Vector2, p2: Vector2 } {
        const u = p2.sub(p1);
        const v = p4.sub(p3);
        const w = p1.sub(p3);
        const a = u.dot(u);
        const b = u.dot(v);
        const c = v.dot(v);
        const d = u.dot(w);
        const e = v.dot(w);
        const D = a * c - b * b;

        let sc, sN, sD = D;
        let tc, tN, tD = D;

        if (D < 1e-8) { // Parallel
            sN = 0.0;
            sD = 1.0;
            tN = e;
            tD = c;
        } else {
            sN = (b * e - c * d);
            tN = (a * e - b * d);
            if (sN < 0.0) {
                sN = 0.0;
                tN = e;
                tD = c;
            } else if (sN > sD) {
                sN = sD;
                tN = e + b;
                tD = c;
            }
        }

        if (tN < 0.0) {
            tN = 0.0;
            if (-d < 0.0) sN = 0.0;
            else if (-d > a) sN = sD;
            else {
                sN = -d;
                sD = a;
            }
        } else if (tN > tD) {
            tN = tD;
            if ((-d + b) < 0.0) sN = 0;
            else if ((-d + b) > a) sN = sD;
            else {
                sN = (-d + b);
                sD = a;
            }
        }

        sc = (Math.abs(sN) < 1e-8 ? 0.0 : sN / sD);
        tc = (Math.abs(tN) < 1e-8 ? 0.0 : tN / tD);

        return {
            p1: p1.add(u.mul(sc)),
            p2: p3.add(v.mul(tc))
        };
    }
}
