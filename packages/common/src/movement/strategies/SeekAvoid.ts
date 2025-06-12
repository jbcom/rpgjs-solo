import * as Matter from 'matter-js';
import { RpgCommonPhysic } from '../../Physic';
import { MovementStrategy } from '../MovementStrategy';

/* Buffers réutilisés */
const vTmp1 = Matter.Vector.create();
const vTmp2 = Matter.Vector.create();

export class SeekAvoid implements MovementStrategy {
  private repulseRadius2: number;
  private arriveRadius2: number;

  /** (4 px)² : plancher pour éviter les divisions par 0 */
  private readonly EPS2 = 16;

  /**
   * @param phys          Monde physique
   * @param target        Fonction → position à suivre
   * @param maxSpeed      Vitesse max (px / ms)
   * @param repulseRadius Rayon de répulsion
   * @param repulseWeight Intensité de la répulsion
   * @param arriveRadius  Rayon dans lequel on “arrive” (≃ taille hitbox)
   * @param getTargetBody (optionnel) fonction → body de la cible pour l’ignorer
   */
  constructor(
    private phys: RpgCommonPhysic,
    private targetBody?: Matter.Body,
    private maxSpeed = 2.5,
    private repulseRadius = 32,
    private repulseWeight = 4,
    private arriveRadius = 16,
           //  ← nouveauté
  ) {
    this.repulseRadius2 = repulseRadius * repulseRadius;
    this.arriveRadius2  = arriveRadius  * arriveRadius;
  }

  /* ------------------------------------------------------------------ */
  update(body: Matter.Body, dt: number): void {
    /* ---- 1) Attraction vers la cible ---- */
    const targetPos = this.targetBody.position;
    Matter.Vector.sub(targetPos, body.position, vTmp1);           // vTmp1 = target - pos
    const dist2 = Matter.Vector.magnitudeSquared(vTmp1);

    let arrived = false

    if (this.targetBody) {
        arrived = Matter.Bounds.overlaps(body.bounds, this.targetBody.bounds);
    } 

    if (arrived) {                                            // à l’intérieur du cercle d’arrivée
      vTmp1.x = 0; vTmp1.y = 0;                   // → plus de “pull”
    } else {
      const invLen = 1 / Math.sqrt(dist2);                        // normalisation
      vTmp1.x *= invLen;
      vTmp1.y *= invLen;
    }

    /* ---- 2) Répulsion des obstacles ---- */
    const area = {
      min: { x: body.position.x - this.repulseRadius,
             y: body.position.y - this.repulseRadius },
      max: { x: body.position.x + this.repulseRadius,
             y: body.position.y + this.repulseRadius }
    };
    const nearby = Matter.Query.region(this.phys.getWorld().bodies, area);

    const targetBody = this.targetBody

    let pushX = 0, pushY = 0;
    if (!arrived) {                                              // on désactive l’évitement si arrivé
      for (const b of nearby) {
        if (b === body || b === targetBody || b.isSensor) continue;

        Matter.Vector.sub(body.position, b.position, vTmp2);      // vTmp2 = pos - obstacle
        let d2 = Matter.Vector.magnitudeSquared(vTmp2);
        if (d2 > this.repulseRadius2) continue;

        if (d2 < this.EPS2) d2 = this.EPS2;
        const w = this.repulseWeight / d2;
        pushX += vTmp2.x * w;
        pushY += vTmp2.y * w;
      }
    }

    /* ---- 3) Limite la poussée ---- */
    const pushLen = Math.hypot(pushX, pushY);
    const maxPush = this.maxSpeed * 4;
    if (pushLen > maxPush) {
      const k = maxPush / pushLen;
      pushX *= k; pushY *= k;
    }

    /* ---- 4) Vitesse désirée ---- */
    let vx = vTmp1.x * this.maxSpeed + pushX;
    let vy = vTmp1.y * this.maxSpeed + pushY;
    const vLen = Math.hypot(vx, vy);
    if (vLen > this.maxSpeed) {
      const k = this.maxSpeed / vLen;
      vx *= k; vy *= k;
    }

    if (!Number.isFinite(vx) || !Number.isFinite(vy)) {
      console.warn('[SeekAvoid] vitesse invalide – reset', { vx, vy });
      vx = 0; vy = 0;
    }

    Matter.Body.setVelocity(body, { x: vx, y: vy });
  }

  setParameters(max?: number, repR?: number, repW?: number, arrR?: number) {
    if (max   !== undefined) this.maxSpeed      = max;
    if (repR  !== undefined) {
      this.repulseRadius     = repR;
      this.repulseRadius2    = repR * repR;
    }
    if (repW  !== undefined) this.repulseWeight = repW;
    if (arrR  !== undefined) {
      this.arriveRadius      = arrR;
      this.arriveRadius2     = arrR * arrR;
    }
  }
}
