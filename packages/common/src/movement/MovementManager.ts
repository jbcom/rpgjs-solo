import {
  MovementManager as CoreMovementManager,
  MovementStrategy,
  Vector2,
  Entity,
} from '@rpgjs/physic';
import { RpgCommonPhysic } from '../Physic';

class PhysicsMovementBody implements MovementBody {
  constructor(
    public readonly id: string,
    private entity: Entity,
  ) {}

  updateEntity(entity: Entity): void {
    this.entity = entity;
  }

  get position(): { x: number; y: number } {
    return this.entity.position;
  }

  get velocity(): { x: number; y: number } {
    return this.entity.velocity;
  }

  setVelocity(velocity: { x: number; y: number }): void {
    this.entity.setVelocity(velocity);
    this.entity.wakeUp();
  }

  translate(delta: { x: number; y: number }): void {
    this.entity.position.addInPlace(new Vector2(delta.x, delta.y));
    this.entity.wakeUp();
  }

  isStatic(): boolean {
    return this.entity.isStatic();
  }

  getEntity(): Entity {
    return this.entity;
  }
}

/**
 * Adapter around the core movement manager to operate on the custom physics entities.
 */
export class MovementManager {
  private readonly bodies = new Map<string, PhysicsMovementBody>();
  private readonly core: CoreMovementManager;

  constructor(private readonly physicProvider: () => RpgCommonPhysic) {
    this.core = new CoreMovementManager((id) => this.ensureBody(id));
  }

  add(id: string, strategy: MovementStrategy): void {
    const body = this.ensureBody(id);
    if (!body) {
      throw new Error(`MovementManager: unknown body for id ${id}`);
    }
    this.core.add(body, strategy);
  }

  remove(id: string, strategy: MovementStrategy): boolean {
    return this.core.remove(id, strategy);
  }

  clear(id: string): void {
    this.core.clear(id);
    this.bodies.delete(id);
  }

  hasActiveStrategies(id: string): boolean {
    return this.core.hasActiveStrategies(id);
  }

  getStrategies(id: string): MovementStrategy[] {
    return this.core.getStrategies(id);
  }

  update(dtMs: number, physic?: RpgCommonPhysic): void {
    const engine = physic ?? this.physicProvider();
    this.refreshBodies(engine);
    const dtSeconds = dtMs / 1000;
    this.core.update(dtSeconds);
  }

  clearAll(): void {
    this.core.clearAll();
    this.bodies.clear();
  }

  private ensureBody(id: string): PhysicsMovementBody | undefined {
    const physic = this.physicProvider();
    const underlying = physic.getBody(id);
    if (!underlying) {
      return undefined;
    }

    let wrapper = this.bodies.get(id);
    if (!wrapper) {
      wrapper = new PhysicsMovementBody(id, underlying);
      this.bodies.set(id, wrapper);
    } else if (wrapper.getEntity() !== underlying) {
      wrapper.updateEntity(underlying);
    }
    return wrapper;
  }

  private refreshBodies(physic: RpgCommonPhysic): void {
    for (const [id, wrapper] of this.bodies.entries()) {
      const body = physic.getBody(id);
      if (!body) {
        this.core.clear(id);
        this.bodies.delete(id);
        continue;
      }
      if (wrapper.getEntity() !== body) {
        wrapper.updateEntity(body);
      }
    }
  }
}

