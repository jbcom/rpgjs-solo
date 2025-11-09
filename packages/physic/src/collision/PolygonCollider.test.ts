import { describe, it, expect } from 'vitest';
import { Entity } from '../physics/Entity';
import { Vector2 } from '../core/math/Vector2';
import { AABBCollider } from './AABBCollider';
import { CircleCollider } from './CircleCollider';
import { PolygonCollider, assignPolygonCollider } from './PolygonCollider';

describe('PolygonCollider', () => {
  it('detects convex polygon vs polygon (SAT)', () => {
    const e1 = new Entity({ position: { x: 0, y: 0 } });
    const e2 = new Entity({ position: { x: 1.5, y: 0 } });
    assignPolygonCollider(e1, { vertices: [
      new Vector2(-1, -1), new Vector2(1, -1), new Vector2(1, 1), new Vector2(-1, 1)
    ], isConvex: true });
    assignPolygonCollider(e2, { vertices: [
      new Vector2(-1, -1), new Vector2(1, -1), new Vector2(1, 1), new Vector2(-1, 1)
    ], isConvex: true });
    const c1 = new PolygonCollider(e1);
    const c2 = new PolygonCollider(e2);
    const col = c1.testCollision(c2);
    expect(col).not.toBeNull();
    expect(col!.depth).toBeGreaterThan(0);
  });

  it('detects polygon vs circle', () => {
    const ePoly = new Entity({ position: { x: 0, y: 0 } });
    const eCircle = new Entity({ position: { x: 0.5, y: 0 }, radius: 0.6 });
    assignPolygonCollider(ePoly, { vertices: [
      new Vector2(-1, -1), new Vector2(1, -1), new Vector2(1, 1), new Vector2(-1, 1)
    ], isConvex: true });
    const poly = new PolygonCollider(ePoly);
    const circle = new CircleCollider(eCircle);
    const col = poly.testCollision(circle);
    expect(col).not.toBeNull();
  });

  it('detects polygon vs AABB', () => {
    const ePoly = new Entity({ position: { x: 0, y: 0 } });
    const eBox = new Entity({ position: { x: 1, y: 0 }, width: 2, height: 2 });
    assignPolygonCollider(ePoly, { vertices: [
      new Vector2(-2, -0.5), new Vector2(0.5, -0.5), new Vector2(0.5, 0.5), new Vector2(-2, 0.5)
    ], isConvex: true });
    const poly = new PolygonCollider(ePoly);
    const box = new AABBCollider(eBox);
    const col = poly.testCollision(box);
    expect(col).not.toBeNull();
  });

  it('supports concave via convex parts', () => {
    const eConcave = new Entity({ position: { x: 0, y: 0 } });
    // "L" shape as two rectangles
    assignPolygonCollider(eConcave, {
      parts: [
        [new Vector2(0,0), new Vector2(2,0), new Vector2(2,0.5), new Vector2(0,0.5)],
        [new Vector2(0,0), new Vector2(0.5,0), new Vector2(0.5,2), new Vector2(0,2)]
      ]
    });
    const poly = new PolygonCollider(eConcave);
    const eCircle = new Entity({ position: { x: 0.4, y: 0.4 }, radius: 0.3 });
    const circle = new CircleCollider(eCircle);
    const col = poly.testCollision(circle);
    expect(col).not.toBeNull();
  });
});


