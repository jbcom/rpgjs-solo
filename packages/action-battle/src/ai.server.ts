import { MAXHP, RpgEvent, RpgPlayer } from "@rpgjs/server";

type RpgEventWithBattleAi = RpgEvent & {
  battleAi: BattleAi;
};

/**
 * AI State enumeration
 * 
 * Defines the different states an AI can be in, each with its own behavior.
 */
export enum AiState {
  Idle = "idle",
  Alert = "alert",
  Combat = "combat",
  Flee = "flee",
  Stunned = "stunned"
}

/**
 * Enemy Type enumeration
 * 
 * Defines different enemy archetypes with unique behaviors.
 * Stats (HP, ATK, etc.) should be set on the event itself via onInit.
 */
export enum EnemyType {
  Aggressive = "aggressive",
  Defensive = "defensive",
  Ranged = "ranged",
  Tank = "tank",
  Berserker = "berserker"
}

/**
 * Attack Pattern enumeration
 * 
 * Different attack patterns the AI can use.
 */
export enum AttackPattern {
  Melee = "melee",
  Combo = "combo",
  Charged = "charged",
  Zone = "zone",
  DashAttack = "dashAttack"
}

/**
 * Advanced Battle AI Controller for events
 *
 * This class provides intelligent combat behavior control for events.
 * It uses the existing RPGJS API for stats, skills, items, etc.
 * The AI only manages behavior - the event's stats should be configured
 * in onInit using standard RPGJS methods.
 *
 * ## Usage with RPGJS API
 * 
 * Configure the event stats using standard RPGJS methods:
 * - `this.hp = 100` - Set health
 * - `this.learnSkill(FireBall)` - Learn a skill
 * - `this.addItem(Potion, 3)` - Add items
 * - `this.equip(Sword)` - Equip items
 * - `this.setClass(WarriorClass)` - Set class
 * - `this.param[ATK] = 20` - Set parameters
 *
 * @example
 * ```ts
 * function GoblinEnemy() {
 *   return {
 *     name: "Goblin",
 *     onInit() {
 *       this.setGraphic("goblin");
 *       
 *       // Configure stats using RPGJS API
 *       this.hp = 80;
 *       this.param[ATK] = 15;
 *       this.param[PDEF] = 5;
 *       this.learnSkill(Slash);
 *       
 *       // Apply AI behavior
 *       new BattleAi(this, {
 *         enemyType: EnemyType.Aggressive,
 *         attackSkill: Slash
 *       });
 *     }
 *   };
 * }
 * ```
 */
export class BattleAi {
  private event: RpgEvent;
  private target: InstanceType<typeof RpgPlayer> | null = null;
  private lastAttackTime: number = 0;
  private updateInterval?: any;

  // State machine
  private state: AiState = AiState.Idle;
  private stateStartTime: number = 0;
  private stunnedUntil: number = 0;

  // Enemy type and behavior
  private enemyType: EnemyType;
  private attackCooldown: number;
  private visionRange: number;
  private attackRange: number;

  // Dodge system
  private dodgeChance: number;
  private dodgeCooldown: number;
  private lastDodgeTime: number = 0;

  // Flee threshold (HP percentage)
  private fleeThreshold: number;

  // Attack configuration
  private attackSkill: any | null; // Skill to use for attacks
  private attackPatterns: AttackPattern[];
  private comboCount: number = 0;
  private comboMax: number = 3;
  private chargingAttack: boolean = false;

  // Group behavior
  private groupBehavior: boolean;
  private nearbyEnemies: BattleAi[] = [];
  private groupUpdateInterval: number = 0;

  // Patrol
  private patrolWaypoints: Array<{ x: number; y: number }> = [];
  private currentPatrolIndex: number = 0;

  // Damage tracking for retreat
  private lastHpCheck: number = 0;
  private recentDamageTaken: number = 0;
  private damageCheckInterval: number = 2000;

  /**
   * Create a new Battle AI Controller
   *
   * The AI controls behavior only. Stats should be set on the event
   * using standard RPGJS methods (hp, param, learnSkill, etc.)
   *
   * @param event - The event to control
   * @param options - AI behavior configuration
   *
   * @example
   * ```ts
   * // In your event's onInit
   * this.hp = 100;
   * this.param[ATK] = 20;
   * this.learnSkill(FireBall);
   * 
   * new BattleAi(this, {
   *   enemyType: EnemyType.Ranged,
   *   attackSkill: FireBall,
   *   visionRange: 200,
   *   fleeThreshold: 0.2
   * });
   * ```
   */
  constructor(
    event: RpgEventWithBattleAi,
    options: {
      enemyType?: EnemyType;
      attackCooldown?: number;
      visionRange?: number;
      attackRange?: number;
      dodgeChance?: number;
      dodgeCooldown?: number;
      fleeThreshold?: number;
      attackSkill?: any;
      attackPatterns?: AttackPattern[];
      patrolWaypoints?: Array<{ x: number; y: number }>;
      groupBehavior?: boolean;
    } = {}
  ) {
    event.battleAi = this;
    this.event = event;

    // Set enemy type and apply behavior modifiers
    this.enemyType = options.enemyType || EnemyType.Aggressive;
    this.applyEnemyTypeBehavior(options);

    // Store attack skill reference
    this.attackSkill = options.attackSkill || null;

    // Initialize attack patterns
    this.attackPatterns = options.attackPatterns || [
      AttackPattern.Melee,
      AttackPattern.Combo,
      AttackPattern.DashAttack
    ];

    // Initialize group behavior
    this.groupBehavior = options.groupBehavior || false;

    // Initialize patrol
    this.patrolWaypoints = options.patrolWaypoints || [];
    this.currentPatrolIndex = 0;

    // Setup AI systems
    this.setupVision();
    this.startAiBehaviorLoop();
    this.changeState(AiState.Idle);
  }

  /**
   * Apply enemy type-specific behavior modifiers
   * 
   * This only affects AI behavior (cooldowns, ranges, dodge).
   * Stats should be set on the event itself.
   */
  private applyEnemyTypeBehavior(options: {
    attackCooldown?: number;
    visionRange?: number;
    attackRange?: number;
    dodgeChance?: number;
    dodgeCooldown?: number;
    fleeThreshold?: number;
  }) {
    switch (this.enemyType) {
      case EnemyType.Aggressive:
        this.attackCooldown = options.attackCooldown ?? 600;
        this.visionRange = options.visionRange ?? 150;
        this.attackRange = options.attackRange ?? 50;
        this.dodgeChance = options.dodgeChance ?? 0.1;
        this.dodgeCooldown = options.dodgeCooldown ?? 3000;
        this.fleeThreshold = options.fleeThreshold ?? 0.15;
        break;

      case EnemyType.Defensive:
        this.attackCooldown = options.attackCooldown ?? 1500;
        this.visionRange = options.visionRange ?? 120;
        this.attackRange = options.attackRange ?? 60;
        this.dodgeChance = options.dodgeChance ?? 0.5;
        this.dodgeCooldown = options.dodgeCooldown ?? 1500;
        this.fleeThreshold = options.fleeThreshold ?? 0.3;
        break;

      case EnemyType.Ranged:
        this.attackCooldown = options.attackCooldown ?? 1200;
        this.visionRange = options.visionRange ?? 200;
        this.attackRange = options.attackRange ?? 120;
        this.dodgeChance = options.dodgeChance ?? 0.4;
        this.dodgeCooldown = options.dodgeCooldown ?? 2000;
        this.fleeThreshold = options.fleeThreshold ?? 0.25;
        break;

      case EnemyType.Tank:
        this.attackCooldown = options.attackCooldown ?? 2000;
        this.visionRange = options.visionRange ?? 100;
        this.attackRange = options.attackRange ?? 50;
        this.dodgeChance = 0;
        this.dodgeCooldown = options.dodgeCooldown ?? 5000;
        this.fleeThreshold = options.fleeThreshold ?? 0.1;
        break;

      case EnemyType.Berserker:
        this.attackCooldown = options.attackCooldown ?? 800;
        this.visionRange = options.visionRange ?? 180;
        this.attackRange = options.attackRange ?? 55;
        this.dodgeChance = options.dodgeChance ?? 0.15;
        this.dodgeCooldown = options.dodgeCooldown ?? 2500;
        this.fleeThreshold = options.fleeThreshold ?? 0.05;
        break;

      default:
        this.attackCooldown = options.attackCooldown ?? 1000;
        this.visionRange = options.visionRange ?? 150;
        this.attackRange = options.attackRange ?? 60;
        this.dodgeChance = options.dodgeChance ?? 0.2;
        this.dodgeCooldown = options.dodgeCooldown ?? 2000;
        this.fleeThreshold = options.fleeThreshold ?? 0.2;
    }
  }

  /**
   * Setup vision detection
   */
  private setupVision() {
    const diameter = this.visionRange * 2;
    this.event.attachShape(`vision_${this.event.id}`, {
      radius: this.visionRange,
      width: diameter,
      height: diameter,
      angle: 360,
    });
  }

  /**
   * Start the AI behavior loop
   */
  private startAiBehaviorLoop() {
    const updateInterval = setInterval(() => {
      if (!this.event.getCurrentMap()) {
        this.destroy();
        return;
      }
      this.updateAiBehavior();
    }, 100);

    this.updateInterval = updateInterval;
  }

  /**
   * Change AI state with validated transitions
   */
  private changeState(newState: AiState) {
    const validTransitions: Record<AiState, AiState[]> = {
      [AiState.Idle]: [AiState.Alert, AiState.Combat],
      [AiState.Alert]: [AiState.Idle, AiState.Combat],
      [AiState.Combat]: [AiState.Idle, AiState.Flee, AiState.Stunned],
      [AiState.Flee]: [AiState.Idle, AiState.Combat],
      [AiState.Stunned]: [AiState.Combat, AiState.Idle]
    };

    if (!validTransitions[this.state].includes(newState)) {
      return;
    }

    this.state = newState;
    this.stateStartTime = Date.now();

    switch (newState) {
      case AiState.Idle:
        if (this.patrolWaypoints.length > 0) {
          this.startPatrol();
        }
        break;
      case AiState.Alert:
        this.event.stopMoveTo();
        break;
      case AiState.Combat:
        this.comboCount = 0;
        break;
      case AiState.Flee:
        if (this.target) {
          this.fleeFromTarget();
        }
        break;
      case AiState.Stunned:
        this.event.stopMoveTo();
        break;
    }
  }

  /**
   * Main AI behavior update loop
   */
  private updateAiBehavior() {
    const currentTime = Date.now();

    // Update group behavior
    if (this.groupBehavior) {
      this.updateGroupBehavior();
    }

    // Check if stunned
    if (this.state === AiState.Stunned) {
      if (currentTime >= this.stunnedUntil) {
        this.changeState(AiState.Combat);
      }
      return;
    }

    // Berserker: faster attacks when HP is low
    if (this.enemyType === EnemyType.Berserker && this.event.param[MAXHP]) {
      const hpPercent = this.event.hp / this.event.param[MAXHP];
      const berserkerModifier = Math.max(0.3, hpPercent);
      this.attackCooldown = 800 * berserkerModifier;
    }

    // State-specific behavior
    switch (this.state) {
      case AiState.Idle:
        this.updateIdleBehavior();
        break;
      case AiState.Alert:
        this.updateAlertBehavior();
        break;
      case AiState.Combat:
        this.updateCombatBehavior(currentTime);
        break;
      case AiState.Flee:
        this.updateFleeBehavior();
        break;
    }

    // Track damage for retreat decision
    this.checkDamageTaken();
  }

  /**
   * Update idle behavior (patrolling)
   */
  private updateIdleBehavior() {
    if (this.patrolWaypoints.length > 0) {
      const waypoint = this.patrolWaypoints[this.currentPatrolIndex];
      const distance = this.getDistance(this.event, {
        x: () => waypoint.x,
        y: () => waypoint.y
      });

      if (distance < 10) {
        this.currentPatrolIndex = (this.currentPatrolIndex + 1) % this.patrolWaypoints.length;
      }
    }
  }

  /**
   * Update alert behavior
   */
  private updateAlertBehavior() {
    if (this.target) {
      this.faceTarget();
      
      const distance = this.getDistance(this.event, this.target);
      if (distance <= this.attackRange * 1.5) {
        this.changeState(AiState.Combat);
      }
    } else {
      this.changeState(AiState.Idle);
    }
  }

  /**
   * Update combat behavior
   */
  private updateCombatBehavior(currentTime: number) {
    if (!this.target) {
      this.changeState(AiState.Idle);
      return;
    }

    const distance = this.getDistance(this.event, this.target);

    // Check if target is still in range
    if (distance > this.visionRange * 1.5) {
      this.target = null;
      this.event.stopMoveTo();
      this.changeState(AiState.Idle);
      return;
    }

    // Check flee threshold
    if (this.event.param[MAXHP]) {
      const hpPercent = this.event.hp / this.event.param[MAXHP];
      if (hpPercent <= this.fleeThreshold) {
        this.changeState(AiState.Flee);
        return;
      }
    }

    // Try dodge
    if (this.canDodge() && this.shouldDodge()) {
      this.tryDodge();
      return;
    }

    // Movement based on enemy type
    if (this.enemyType === EnemyType.Ranged) {
      if (distance < this.attackRange * 0.6) {
        this.retreatFromTarget();
      } else if (distance > this.attackRange) {
        this.event.moveTo(this.target);
      } else {
        this.event.stopMoveTo();
      }
    } else {
      if (distance > this.attackRange) {
        this.event.moveTo(this.target);
      } else {
        this.event.stopMoveTo();
      }
    }

    // Attack if ready
    if (distance <= this.attackRange && currentTime - this.lastAttackTime >= this.attackCooldown) {
      if (!this.chargingAttack) {
        this.selectAndPerformAttack();
        this.lastAttackTime = currentTime;
      }
    }
  }

  /**
   * Update flee behavior
   */
  private updateFleeBehavior() {
    if (!this.target) {
      this.changeState(AiState.Idle);
      return;
    }

    const distance = this.getDistance(this.event, this.target);

    // Check if HP recovered or target is far
    if (this.event.param[MAXHP]) {
      const hpPercent = this.event.hp / this.event.param[MAXHP];
      if (hpPercent > this.fleeThreshold * 1.5 || distance > this.visionRange * 2) {
        this.changeState(AiState.Combat);
        return;
      }
    }

    this.fleeFromTarget();
  }

  /**
   * Select and perform an attack pattern
   */
  private selectAndPerformAttack() {
    if (!this.target) return;

    // Continue combo if active
    if (this.comboCount > 0 && this.comboCount < this.comboMax) {
      this.performComboAttack();
      return;
    }

    // Select pattern based on weights
    const pattern = this.selectAttackPattern();
    this.performAttackPattern(pattern);
  }

  /**
   * Select attack pattern with weighted probability
   */
  private selectAttackPattern(): AttackPattern {
    const weights: Record<AttackPattern, number> = {
      [AttackPattern.Melee]: 40,
      [AttackPattern.Combo]: 25,
      [AttackPattern.Charged]: 15,
      [AttackPattern.Zone]: 10,
      [AttackPattern.DashAttack]: 10
    };

    // Adjust based on enemy type
    switch (this.enemyType) {
      case EnemyType.Aggressive:
        weights[AttackPattern.Combo] += 20;
        weights[AttackPattern.DashAttack] += 15;
        break;
      case EnemyType.Defensive:
        weights[AttackPattern.Charged] += 25;
        break;
      case EnemyType.Ranged:
        weights[AttackPattern.Zone] += 20;
        break;
      case EnemyType.Tank:
        weights[AttackPattern.Charged] += 30;
        weights[AttackPattern.Zone] += 15;
        break;
      case EnemyType.Berserker:
        weights[AttackPattern.Combo] += 35;
        break;
    }

    // Calculate selection
    let total = 0;
    const available: Array<{ pattern: AttackPattern; weight: number }> = [];
    
    this.attackPatterns.forEach(p => {
      const weight = weights[p] || 10;
      total += weight;
      available.push({ pattern: p, weight });
    });

    let random = Math.random() * total;
    for (const item of available) {
      random -= item.weight;
      if (random <= 0) return item.pattern;
    }

    return this.attackPatterns[0] || AttackPattern.Melee;
  }

  /**
   * Perform attack pattern
   */
  private performAttackPattern(pattern: AttackPattern) {
    switch (pattern) {
      case AttackPattern.Melee:
        this.performMeleeAttack();
        break;
      case AttackPattern.Combo:
        this.performComboAttack();
        break;
      case AttackPattern.Charged:
        this.performChargedAttack();
        break;
      case AttackPattern.Zone:
        this.performZoneAttack();
        break;
      case AttackPattern.DashAttack:
        this.performDashAttack();
        break;
    }
  }

  /**
   * Perform melee attack
   * Uses skill if configured, otherwise creates hitbox
   */
  private performMeleeAttack() {
    if (!this.target) return;

    this.faceTarget();
    this.event.setAnimation('attack', 1);

    // Use skill if available
    if (this.attackSkill) {
      try {
        this.event.useSkill(this.attackSkill, this.target);
      } catch (e) {
        // Skill failed (no SP, etc.) - fall back to basic attack
        this.performBasicHitbox();
      }
    } else {
      this.performBasicHitbox();
    }
  }

  /**
   * Perform basic hitbox attack when no skill is set
   */
  private performBasicHitbox() {
    if (!this.target) return;

    const eventX = this.event.x();
    const eventY = this.event.y();
    const dx = this.target.x() - eventX;
    const dy = this.target.y() - eventY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0) return;

    const dirX = dx / dist;
    const dirY = dy / dist;

    const hitboxes = [{
      x: eventX + dirX * 30,
      y: eventY + dirY * 30,
      width: 40,
      height: 40,
    }];

    const map = this.event.getCurrentMap();
    map?.createMovingHitbox(hitboxes, { speed: 5 }).subscribe({
      next: (hits) => {
        hits.forEach((hit) => {
          if (hit instanceof RpgPlayer && hit !== this.event) {
            this.applyHit(hit);
          }
        });
      },
    });
  }

  /**
   * Apply hit to target using RPGJS damage system
   */
  private applyHit(target: RpgPlayer) {
    // Use RPGJS damage formula
    const { damage } = target.applyDamage(this.event as any);

    // Visual feedback
    target.flash({
      type: 'tint',
      tint: 'red',
      duration: 200,
      cycles: 1
    });
    target.showHit(`-${damage}`);
  }

  /**
   * Perform combo attack
   */
  private performComboAttack() {
    if (!this.target) return;

    this.comboCount++;
    this.performMeleeAttack();

    if (this.comboCount < this.comboMax) {
      setTimeout(() => {
        if (this.target && this.state === AiState.Combat) {
          this.performComboAttack();
        } else {
          this.comboCount = 0;
        }
      }, 300);
    } else {
      this.comboCount = 0;
    }
  }

  /**
   * Perform charged attack
   */
  private performChargedAttack() {
    if (!this.target) return;

    this.chargingAttack = true;
    this.faceTarget();
    this.event.setAnimation('attack', 2);

    setTimeout(() => {
      if (!this.target || this.state !== AiState.Combat) {
        this.chargingAttack = false;
        return;
      }

      // Charged attacks can use a stronger skill or wider hitbox
      if (this.attackSkill) {
        try {
          this.event.useSkill(this.attackSkill, this.target);
        } catch (e) {
          this.performBasicHitbox();
        }
      } else {
        this.performBasicHitbox();
      }
      
      this.chargingAttack = false;
    }, 800);
  }

  /**
   * Perform zone attack (360 degrees)
   */
  private performZoneAttack() {
    this.event.setAnimation('attack', 1);

    const eventX = this.event.x();
    const eventY = this.event.y();
    const radius = 50;

    const hitboxes: Array<{ x: number; y: number; width: number; height: number }> = [];
    const angles = [0, 90, 180, 270];

    angles.forEach(angle => {
      const rad = (angle * Math.PI) / 180;
      hitboxes.push({
        x: eventX + Math.cos(rad) * radius,
        y: eventY + Math.sin(rad) * radius,
        width: 40,
        height: 40,
      });
    });

    const map = this.event.getCurrentMap();
    map?.createMovingHitbox(hitboxes, { speed: 5 }).subscribe({
      next: (hits) => {
        hits.forEach((hit) => {
          if (hit instanceof RpgPlayer && hit !== this.event) {
            this.applyHit(hit);
          }
        });
      },
    });
  }

  /**
   * Perform dash attack
   */
  private performDashAttack() {
    if (!this.target) return;

    const dx = this.target.x() - this.event.x();
    const dy = this.target.y() - this.event.y();
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0) return;

    const dirX = dx / dist;
    const dirY = dy / dist;

    this.faceTarget();
    this.event.dash({ x: dirX, y: dirY }, 10, 200);

    setTimeout(() => {
      if (!this.target || this.state !== AiState.Combat) return;
      this.performMeleeAttack();
    }, 200);
  }

  /**
   * Face the current target
   */
  private faceTarget() {
    if (!this.target) return;

    const dx = this.target.x() - this.event.x();
    const dy = this.target.y() - this.event.y();
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    let direction: string;
    if (absX >= absY) {
      direction = dx >= 0 ? 'right' : 'left';
    } else {
      direction = dy >= 0 ? 'down' : 'up';
    }
    this.event.changeDirection(direction as any);
  }

  /**
   * Try to dodge
   */
  private tryDodge() {
    const currentTime = Date.now();

    if (currentTime - this.lastDodgeTime < this.dodgeCooldown) return;
    if (Math.random() > this.dodgeChance) return;
    if (!this.target) return;

    const dx = this.target.x() - this.event.x();
    const dy = this.target.y() - this.event.y();
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0) return;

    // Perpendicular direction
    const dodgeDirX = -dy / dist;
    const dodgeDirY = dx / dist;
    const side = Math.random() > 0.5 ? 1 : -1;

    this.event.dash({ x: dodgeDirX * side, y: dodgeDirY * side }, 12, 300);
    this.lastDodgeTime = currentTime;

    // Counter-attack for defensive types
    if (this.enemyType === EnemyType.Defensive && Math.random() < 0.5) {
      setTimeout(() => {
        if (this.target && this.state === AiState.Combat) {
          this.selectAndPerformAttack();
        }
      }, 400);
    }
  }

  private canDodge(): boolean {
    if (this.dodgeChance === 0) return false;
    return Date.now() - this.lastDodgeTime >= this.dodgeCooldown;
  }

  private shouldDodge(): boolean {
    if (!this.target) return false;
    const distance = this.getDistance(this.event, this.target);
    return distance < this.attackRange * 0.8;
  }

  /**
   * Flee from target
   */
  private fleeFromTarget() {
    if (!this.target) return;

    const dx = this.event.x() - this.target.x();
    const dy = this.event.y() - this.target.y();
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0) return;

    const fleeTarget = {
      x: () => this.event.x() + (dx / dist) * 200,
      y: () => this.event.y() + (dy / dist) * 200
    };

    this.event.moveTo(fleeTarget as any);
  }

  /**
   * Retreat from target (temporary)
   */
  private retreatFromTarget() {
    if (!this.target) return;

    const dx = this.event.x() - this.target.x();
    const dy = this.event.y() - this.target.y();
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0) return;

    this.event.dash({ x: dx / dist, y: dy / dist }, 8, 200);
  }

  /**
   * Check damage taken for retreat decision
   */
  private checkDamageTaken() {
    const currentTime = Date.now();
    
    if (currentTime - this.lastHpCheck >= this.damageCheckInterval) {
      this.recentDamageTaken = 0;
      this.lastHpCheck = currentTime;
    }
  }

  /**
   * Start patrol
   */
  private startPatrol() {
    if (this.patrolWaypoints.length === 0) return;

    const waypoint = this.patrolWaypoints[this.currentPatrolIndex];
    this.event.moveTo({ x: () => waypoint.x, y: () => waypoint.y } as any);
  }

  /**
   * Update group behavior
   */
  private updateGroupBehavior() {
    if (!this.groupBehavior) return;

    this.groupUpdateInterval++;
    if (this.groupUpdateInterval >= 20) {
      this.groupUpdateInterval = 0;
      this.findNearbyEnemies();
    }

    if (this.nearbyEnemies.length > 0 && this.target && this.state === AiState.Combat) {
      this.applyFormation();
    }
  }

  /**
   * Find nearby enemies
   */
  private findNearbyEnemies() {
    this.nearbyEnemies = [];
    const map = this.event.getCurrentMap();
    if (!map) return;

    const allEvents = Object.values(map.events());
    const groupRadius = 150;

    allEvents.forEach(event => {
      if (event === this.event) return;

      const ai = (event as any).battleAi as BattleAi;
      if (ai && ai.groupBehavior) {
        const distance = this.getDistance(this.event, event);
        if (distance <= groupRadius) {
          this.nearbyEnemies.push(ai);
        }
      }
    });
  }

  /**
   * Apply formation around target
   */
  private applyFormation() {
    if (!this.target || this.nearbyEnemies.length === 0) return;

    const totalEnemies = this.nearbyEnemies.length + 1;
    const angleStep = (2 * Math.PI) / totalEnemies;

    let ourIndex = 0;
    for (let i = 0; i < this.nearbyEnemies.length; i++) {
      if (this.nearbyEnemies[i].event.id < this.event.id) {
        ourIndex++;
      }
    }

    const angle = angleStep * ourIndex;
    const formationRadius = this.attackRange * 1.2;

    const formationX = this.target.x() + Math.cos(angle) * formationRadius;
    const formationY = this.target.y() + Math.sin(angle) * formationRadius;

    const distanceToFormation = Math.sqrt(
      Math.pow(this.event.x() - formationX, 2) +
      Math.pow(this.event.y() - formationY, 2)
    );

    if (distanceToFormation > 20) {
      this.event.moveTo({ x: () => formationX, y: () => formationY } as any);
    }
  }

  /**
   * Handle player entering vision
   */
  onDetectInShape(player: InstanceType<typeof RpgPlayer>, shape: any) {
    this.target = player;

    if (this.state === AiState.Idle) {
      this.changeState(AiState.Alert);
    } else if (this.state === AiState.Alert) {
      this.changeState(AiState.Combat);
    }
  }

  /**
   * Handle player leaving vision
   */
  onDetectOutShape(player: InstanceType<typeof RpgPlayer>, shape: any) {
    if (this.target === player) {
      this.target = null;
      this.event.stopMoveTo();
      this.changeState(AiState.Idle);
    }
  }

  /**
   * Handle taking damage (called from server.ts)
   * 
   * This triggers state changes like stun and flee check.
   * The actual damage is applied externally via RPGJS API.
   */
  takeDamage(attacker: RpgPlayer): boolean {
    // Apply damage using RPGJS system
    const { damage } = this.event.applyDamage(attacker);

    // Visual feedback
    this.event.flash({
      type: 'tint',
      tint: 'red',
      duration: 200,
      cycles: 1
    });
    this.event.showHit(`-${damage}`);

    // Track damage
    this.recentDamageTaken += damage;

    // Brief stun
    if (this.state !== AiState.Stunned && this.state !== AiState.Flee) {
      this.stunnedUntil = Date.now() + 150;
      this.changeState(AiState.Stunned);
    }

    // Check death
    if (this.event.hp <= 0) {
      this.kill();
      return true;
    }

    return false;
  }

  /**
   * Kill this AI
   */
  private kill() {
    console.log(`AI ${this.event.id} has been defeated!`);
    this.destroy();
    this.event.remove();
  }

  /**
   * Get distance between entities
   */
  private getDistance(entity1: any, entity2: any): number {
    const dx = entity1.x() - entity2.x();
    const dy = entity1.y() - entity2.y();
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Public getters
  getHealth(): number { return this.event.hp; }
  getMaxHealth(): number { return this.event.param[MAXHP]; }
  getTarget(): InstanceType<typeof RpgPlayer> | null { return this.target; }
  getState(): AiState { return this.state; }
  getEnemyType(): EnemyType { return this.enemyType; }

  /**
   * Clean up
   */
  destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined;
    }
    this.target = null;
    this.nearbyEnemies = [];
  }
}
