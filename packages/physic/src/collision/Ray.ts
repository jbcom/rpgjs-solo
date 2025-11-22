import { Vector2 } from '../core/math/Vector2';
import { Entity } from '../physics/Entity';

/**
 * Raycast hit information
 */
export interface RaycastHit {
    /** Entity hit by the ray */
    entity: Entity;
    /** Point of intersection */
    point: Vector2;
    /** Normal at the point of intersection */
    normal: Vector2;
    /** Distance from ray origin to intersection point */
    distance: number;
}

/**
 * Ray for raycasting
 */
export class Ray {
    /** Ray origin */
    public origin: Vector2;
    /** Ray direction (normalized) */
    public direction: Vector2;
    /** Maximum length of the ray */
    public length: number;

    /**
     * Creates a new ray
     * 
     * @param origin - Ray origin
     * @param direction - Ray direction
     * @param length - Maximum length (default: Infinity)
     */
    constructor(origin: Vector2, direction: Vector2, length: number = Infinity) {
        this.origin = origin.clone();
        this.direction = direction.clone().normalizeInPlace();
        this.length = length;
    }

    /**
     * Gets a point along the ray
     * 
     * @param distance - Distance from origin
     * @returns Point at distance
     */
    public getPoint(distance: number): Vector2 {
        return this.origin.add(this.direction.mul(distance));
    }
}
