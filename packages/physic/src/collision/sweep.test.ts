import { describe, it, expect } from 'vitest';
import { Entity } from '../physics/Entity';
import { Vector2 } from '../core/math/Vector2';
import { sweepEntities } from './sweep';

describe('sweep (CCD)', () => {
  it('finds TOI for fast circle vs circle', () => {
    const a = new Entity({ position: { x: 0, y: 0 }, radius: 1, velocity: { x: 600, y: 0 } });
    const b = new Entity({ position: { x: 10, y: 0 }, radius: 1, velocity: { x: 0, y: 0 } });
    const dt = 1/60;
    const rel = a.velocity.sub(b.velocity).mul(dt);
    const hit = sweepEntities(a, b, rel);
    expect(hit).not.toBeNull();
    expect(hit!.time).toBeGreaterThanOrEqual(0);
    expect(hit!.time).toBeLessThanOrEqual(1);
  });

  it('returns null when no collision in interval', () => {
    const a = new Entity({ position: { x: 0, y: 0 }, radius: 1, velocity: { x: -100, y: 0 } });
    const b = new Entity({ position: { x: 10, y: 0 }, radius: 1, velocity: { x: 0, y: 0 } });
    const dt = 1/60;
    const rel = a.velocity.sub(b.velocity).mul(dt);
    const hit = sweepEntities(a, b, rel);
    expect(hit).toBeNull();
  });
});


