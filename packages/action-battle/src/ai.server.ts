import { MAXHP, RpgEvent, RpgPlayer } from "@rpgjs/server";
import {
  getActionBattleAnimationRemovalDelay,
  playActionBattleAnimation,
} from "./animations";
import { getActionBattleOptions } from "./config";
import { getActionBattleSystems } from "./core/context";
import {
  isActionBattleEntityInvincible,
  setActionBattleInvincibility,
} from "./core/hit-reaction";
import {
  normalizeActionBattleEnemyAttackProfiles,
  type ActionBattleEnemyAttackProfileMap,
  type NormalizedActionBattleEnemyAttackProfileMap,
} from "./core/enemy-attack-profiles";
import {
  resolveActionBattleHitboxSpeed,
  scheduleActionBattleStartup,
} from "./core/attack-runtime";
import type { ActionBattleDamageResult } from "./core/contracts";
import type {
  NormalizedActionBattleAttackProfile,
  NormalizedActionBattleHitReactionProfile,
} from "./types";
import type { ActionBattleAnimationOptions } from "./types";

type RpgEventWithBattleAi = RpgEvent & {
  battleAi?: BattleAi;
};

export interface BattleAiOptions {
  enemyType?: EnemyType;
  attackCooldown?: number;
  visionRange?: number;
  attackRange?: number;
  dodgeChance?: number;
  dodgeCooldown?: number;
  fleeThreshold?: number;
  attackSkill?: any;
  attackPatterns?: AttackPattern[];
  attackProfiles?: ActionBattleEnemyAttackProfileMap;
  patrolWaypoints?: Array<{ x: number; y: number }>;
  groupBehavior?: boolean;
  moveToCooldown?: number;
  retreatCooldown?: number;
  poise?: number;
  hitstunMs?: number;
  invincibilityMs?: number;
  behavior?: {
    baseScore?: number;
    updateInterval?: number;
    minStateDuration?: number;
    assaultThreshold?: number;
    retreatThreshold?: number;
  };
  behaviorKey?: string;
  animations?: ActionBattleAnimationOptions;
  /** Callback called when the AI is defeated */
  onDefeated?: (event: RpgEvent, attacker?: RpgPlayer) => void;
}

/**
 * Hit result data returned after applying damage
 * 
 * Contains information about the hit including damage dealt,
 * knockback parameters, and whether the target was defeated.
 * Used by hooks to customize hit behavior.
 * 
 * @example
 * ```ts
 * const hitResult: HitResult = {
 *   damage: 25,
 *   knockbackForce: 50,
 *   knockbackDuration: 300,
 *   defeated: false,
 *   attacker: this.event,
 *   target: player
 * };
 * ```
 */
export interface HitResult {
  /** Damage dealt to the target */
  damage: number;
  /** Knockback force applied (from weapon or default) */
  knockbackForce: number;
  /** Knockback duration in milliseconds */
  knockbackDuration: number;
  /** Whether the target was defeated */
  defeated: boolean;
  /** The entity that attacked */
  attacker: RpgEvent | RpgPlayer;
  /** The entity that was hit */
  target: RpgPlayer | RpgEvent;
}

/**
 * Hook options for customizing hit behavior
 * 
 * Allows overriding knockback parameters and adding custom effects
 * when a hit is applied.
 * 
 * @example
 * ```ts
 * const hooks: ApplyHitHooks = {
 *   onBeforeHit(result) {
 *     // Reduce knockback for armored enemies
 *     if (result.target.hasState('armored')) {
 *       result.knockbackForce *= 0.5;
 *     }
 *     return result;
 *   },
 *   onAfterHit(result) {
 *     // Add poison effect on hit
 *     if (Math.random() < 0.3) {
 *       result.target.addState('poison');
 *     }
 *   }
 * };
 * ```
 */
export interface ApplyHitHooks {
  /**
   * Called before the hit is applied
   * Can modify the hit result before damage and knockback
   * 
   * @param result - The hit result data
   * @returns Modified hit result or void to use original
   */
  onBeforeHit?: (result: HitResult) => HitResult | void;
  
  /**
   * Called after the hit is applied
   * Used for side effects like adding states, playing sounds, etc.
   * 
   * @param result - The final hit result data
   */
  onAfterHit?: (result: HitResult) => void;
}

/**
 * AI Debug Logger
 * 
 * Conditional logging utility for AI behavior debugging.
 * Enable by setting `AiDebug.enabled = true` or via environment variable `RPGJS_DEBUG_AI=1`
 * 
 * @example
 * ```ts
 * // Enable debug logging
 * AiDebug.enabled = true;
 * 
 * // Or filter by event ID
 * AiDebug.filterEventId = 'goblin-1';
 * ```
 */
export const AiDebug = {
  /** Enable/disable all AI debug logs */
  enabled:
    ((globalThis as { process?: { env?: Record<string, string> } }).process
      ?.env?.RPGJS_DEBUG_AI === "1") || false,
  
  /** Filter logs to a specific event ID (null = all events) */
  filterEventId: null as string | null,
  
  /** Log categories to enable (empty = all) */
  categories: [] as string[],
  
  /**
   * Log an AI debug message
   * 
   * @param category - Log category (e.g., 'state', 'attack', 'movement', 'damage')
   * @param eventId - Event ID for filtering
   * @param message - Log message
   * @param data - Optional additional data
   */
  log(category: string, eventId: string | undefined, message: string, data?: any): void {
    if (!this.enabled) return;
    if (this.filterEventId && eventId !== this.filterEventId) return;
    if (this.categories.length > 0 && !this.categories.includes(category)) return;
    
    const prefix = `[AI:${category}]${eventId ? ` [${eventId.substring(0, 8)}]` : ''}`;
    if (data !== undefined) {
      console.log(prefix, message, data);
    } else {
      console.log(prefix, message);
    }
  }
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
 * Default knockback configuration
 * 
 * Used when no weapon is equipped or weapon doesn't specify knockback.
 */
export const DEFAULT_KNOCKBACK = {
  /** Default knockback force */
  force: 50,
  /** Default knockback duration in milliseconds */
  duration: 300
};

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

  /**
   * Log AI debug message for this event
   */
  private debugLog(category: string, message: string, data?: any): void {
    AiDebug.log(category, this.event.id, message, data);
  }

  // State machine
  private state: AiState = AiState.Idle;
  private stateStartTime: number = 0;
  private stunnedUntil: number = 0;

  // Enemy type and behavior
  private enemyType: EnemyType;
  private attackCooldown: number = 1000;
  private visionRange: number = 150;
  private attackRange: number = 60;

  // Dodge system
  private dodgeChance: number = 0.2;
  private dodgeCooldown: number = 2000;
  private lastDodgeTime: number = 0;

  // Flee threshold (HP percentage)
  private fleeThreshold: number = 0.2;

  // Attack configuration
  private attackSkill: any | null; // Skill to use for attacks
  private attackPatterns: AttackPattern[];
  private attackProfiles: NormalizedActionBattleEnemyAttackProfileMap;
  private animations?: ActionBattleAnimationOptions;
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

  // Movement state tracking to avoid redundant moveTo calls
  private isMovingToTarget: boolean = false;

  // Callback when AI is defeated
  private onDefeatedCallback?: (event: RpgEvent, attacker?: RpgPlayer) => void;

  // Direction hysteresis to prevent animation flickering
  private lastFacingDirection: string | null = null;

  // Behavior gauge (0-100)
  private behaviorScore: number = 50;
  private behaviorMode: 'assault' | 'tactical' | 'retreat' = 'tactical';
  private behaviorLastUpdate: number = 0;
  private behaviorUpdateInterval: number = 400;
  private behaviorAssaultThreshold: number = 65;
  private behaviorRetreatThreshold: number = 35;
  private behaviorMinStateDuration: number = 600;
  private behaviorEnabled: boolean = false;

  // Movement throttling
  private moveToCooldown: number = 400;
  private lastMoveToTime: number = 0;
  private retreatCooldown: number = 600;
  private lastRetreatTime: number = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private behaviorKey?: string;
  private poise: number = 0;
  private hitstunMs: number = 150;
  private invincibilityMs: number = 250;

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
    options: BattleAiOptions = {}
  ) {
    event.battleAi = this;
    this.event = event;

    // Set enemy type and apply behavior modifiers
    this.enemyType = options.enemyType || EnemyType.Aggressive;
    this.behaviorKey = options.behaviorKey ?? this.enemyType;
    this.applyEnemyTypeBehavior(options);

    // Store attack skill reference
    this.attackSkill = options.attackSkill || null;
    this.animations = {
      ...getActionBattleOptions().animations,
      ...options.animations,
    };

    // Initialize attack patterns
    this.attackPatterns = options.attackPatterns || [
      AttackPattern.Melee,
      AttackPattern.Combo,
      AttackPattern.DashAttack
    ];
    this.attackProfiles = normalizeActionBattleEnemyAttackProfiles(
      options.attackProfiles
    );

    // Initialize group behavior
    this.groupBehavior = options.groupBehavior || false;

    // Initialize patrol
    this.patrolWaypoints = options.patrolWaypoints || [];
    this.currentPatrolIndex = 0;

    // Initialize defeat callback
    this.onDefeatedCallback = options.onDefeated;

    // Behavior gauge settings
    if (options.behavior) {
      this.behaviorEnabled = true;
      if (options.behavior.baseScore !== undefined) {
        this.behaviorScore = options.behavior.baseScore;
      }
      if (options.behavior.updateInterval !== undefined) {
        this.behaviorUpdateInterval = options.behavior.updateInterval;
      }
      if (options.behavior.minStateDuration !== undefined) {
        this.behaviorMinStateDuration = options.behavior.minStateDuration;
      }
      if (options.behavior.assaultThreshold !== undefined) {
        this.behaviorAssaultThreshold = options.behavior.assaultThreshold;
      }
      if (options.behavior.retreatThreshold !== undefined) {
        this.behaviorRetreatThreshold = options.behavior.retreatThreshold;
      }
    }

    if (options.moveToCooldown !== undefined) {
      this.moveToCooldown = options.moveToCooldown;
    }
    if (options.retreatCooldown !== undefined) {
      this.retreatCooldown = options.retreatCooldown;
    }
    if (options.poise !== undefined) {
      this.poise = Math.max(0, options.poise);
    }
    if (options.hitstunMs !== undefined) {
      this.hitstunMs = Math.max(0, options.hitstunMs);
    }
    if (options.invincibilityMs !== undefined) {
      this.invincibilityMs = Math.max(0, options.invincibilityMs);
    }

    // Setup AI systems
    this.setupVision();
    this.startAiBehaviorLoop();
    if (this.patrolWaypoints.length > 0) {
      this.startPatrol();
    }

    this.debugLog('init', `AI created (type=${this.enemyType}, visionRange=${this.visionRange}, attackRange=${this.attackRange})`);
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
    if (newState === this.state) {
      return;
    }
    const validTransitions: Record<AiState, AiState[]> = {
      [AiState.Idle]: [AiState.Alert, AiState.Combat],
      [AiState.Alert]: [AiState.Idle, AiState.Combat],
      [AiState.Combat]: [AiState.Idle, AiState.Flee, AiState.Stunned],
      [AiState.Flee]: [AiState.Idle, AiState.Combat],
      [AiState.Stunned]: [AiState.Combat, AiState.Idle]
    };

    if (!validTransitions[this.state].includes(newState)) {
      this.debugLog('state', `INVALID transition ${this.state} -> ${newState}`);
      return;
    }

    this.debugLog('state', `STATE change: ${this.state} -> ${newState}`);
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

    // Update behavior gauge and state decision
    if (this.behaviorEnabled) {
      this.updateBehavior(currentTime);
    }

    this.applyCustomBehavior(currentTime);

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
        this.startPatrol();
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
      this.debugLog('combat', 'No target, returning to idle');
      this.changeState(AiState.Idle);
      return;
    }

    const distance = this.getDistance(this.event, this.target);

    // Check if target is still in range
    if (distance > this.visionRange * 1.5) {
      this.debugLog('combat', `Target out of range (dist=${distance.toFixed(1)}, maxRange=${(this.visionRange * 1.5).toFixed(1)})`);
      this.target = null;
      this.isMovingToTarget = false;
      this.event.stopMoveTo();
      this.changeState(AiState.Idle);
      return;
    }

    // Check flee threshold
    if (this.event.param[MAXHP]) {
      const hpPercent = this.event.hp / this.event.param[MAXHP];
      if (hpPercent <= this.fleeThreshold) {
        this.debugLog('combat', `HP low (${(hpPercent * 100).toFixed(0)}%), fleeing`);
        this.isMovingToTarget = false;
        this.changeState(AiState.Flee);
        return;
      }
    }

    // Try dodge
    if (this.canDodge() && this.shouldDodge()) {
      this.debugLog('combat', 'Attempting dodge');
      if (this.tryDodge()) {
        this.isMovingToTarget = false;
        return;
      }
    }

    if (this.behaviorEnabled) {
      if (this.behaviorMode === 'tactical') {
        this.handleTacticalMovement(distance);
      } else if (this.behaviorMode === 'assault') {
        this.handleAssaultMovement(distance);
      } else if (this.behaviorMode === 'retreat') {
        this.isMovingToTarget = false;
        this.fleeFromTarget();
        return;
      }
    }

    // Movement based on enemy type
    if (this.behaviorEnabled && this.behaviorMode === 'assault') {
      // Assault mode already handled movement
    } else if (this.behaviorEnabled && this.behaviorMode === 'tactical') {
      // Tactical mode already handled movement
    } else if (this.enemyType === EnemyType.Ranged) {
      if (distance < this.attackRange * 0.6) {
        this.debugLog('movement', `Retreating (dist=${distance.toFixed(1)}, minRange=${(this.attackRange * 0.6).toFixed(1)})`);
        this.isMovingToTarget = false;
        this.retreatFromTarget();
      } else if (distance > this.attackRange) {
        if (!this.isMovingToTarget) {
          this.debugLog('movement', `Moving to target (dist=${distance.toFixed(1)}, attackRange=${this.attackRange})`);
          this.isMovingToTarget = true;
          this.requestMoveTo(this.target);
        }
      } else {
        if (this.isMovingToTarget) {
          this.debugLog('movement', `In range, stopping (dist=${distance.toFixed(1)})`);
          this.isMovingToTarget = false;
          this.event.stopMoveTo();
        }
      }
    } else {
      if (distance > this.attackRange) {
        if (!this.isMovingToTarget) {
          this.debugLog('movement', `Moving to target (dist=${distance.toFixed(1)}, attackRange=${this.attackRange})`);
          this.isMovingToTarget = true;
          this.requestMoveTo(this.target);
        }
      } else {
        if (this.isMovingToTarget) {
          this.debugLog('movement', `In range, stopping (dist=${distance.toFixed(1)})`);
          this.isMovingToTarget = false;
          this.event.stopMoveTo();
        }
      }
    }

    // Attack if ready
    if (distance <= this.attackRange && currentTime - this.lastAttackTime >= this.attackCooldown) {
      if (!this.chargingAttack) {
        this.debugLog('attack', `Attacking (dist=${distance.toFixed(1)}, cooldown=${this.attackCooldown}ms)`);
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
      this.debugLog('attack', `Continuing combo (${this.comboCount}/${this.comboMax})`);
      this.performComboAttack();
      return;
    }

    // Select pattern based on weights
    const pattern = this.selectAttackPattern();
    this.debugLog('attack', `Selected pattern: ${pattern}`);
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
    const profile = this.getAttackProfile(AttackPattern.Melee);

    this.faceTarget();
    this.telegraphAttack(profile);
    playActionBattleAnimation("attack", this.event, this.animations, {
      target: this.target,
    });

    this.scheduleAttackStartup(profile, () => {
      this.executeMeleeAttack(profile, AttackPattern.Melee);
    });
  }

  private executeMeleeAttack(
    profile: NormalizedActionBattleAttackProfile,
    pattern: AttackPattern
  ) {
    if (!this.target) return;
    this.debugLog('attack', `Applying ${pattern} hit`);

    // Use skill if available
    if (this.attackSkill) {
      try {
        playActionBattleAnimation("castSkill", this.event, this.animations, {
          skill: this.attackSkill,
          target: this.target,
        });
        this.event.useSkill(this.attackSkill, this.target);
      } catch (e) {
        // Skill failed (no SP, etc.) - fall back to basic attack
        this.performBasicHitbox(profile, pattern);
      }
    } else {
      this.performBasicHitbox(profile, pattern);
    }
  }

  /**
   * Perform basic hitbox attack when no skill is set
   */
  private performBasicHitbox(
    profile: NormalizedActionBattleAttackProfile = this.getAttackProfile(
      AttackPattern.Melee
    ),
    pattern: AttackPattern = AttackPattern.Melee
  ) {
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
    map?.createMovingHitbox(hitboxes, {
      speed: resolveActionBattleHitboxSpeed(profile, hitboxes.length),
    }).subscribe({
      next: (hits: any[]) => {
        hits.forEach((hit: any) => {
          if (hit instanceof RpgPlayer && hit !== this.event) {
            this.applyHit(hit, undefined, profile, pattern);
          }
        });
      },
    });
  }

  /**
   * Apply hit to target using RPGJS damage system with knockback
   * 
   * Calculates damage using RPGJS formula, applies knockback based on
   * equipped weapon's knockbackForce property, and triggers visual effects.
   * Supports hooks for customizing behavior.
   * 
   * @param target - The player or entity being hit
   * @param hooks - Optional hooks for customizing hit behavior
   * @returns The hit result containing damage and knockback info
   * 
   * @example
   * ```ts
   * // Basic hit
   * this.applyHit(player);
   * 
   * // With custom hooks
   * this.applyHit(player, {
   *   onBeforeHit(result) {
   *     result.knockbackForce *= 1.5; // Increase knockback
   *     return result;
   *   },
   *   onAfterHit(result) {
   *     console.log(`Dealt ${result.damage} damage!`);
   *   }
   * });
   * ```
   */
  private applyHit(
    target: RpgPlayer,
    hooks?: ApplyHitHooks,
    profile: NormalizedActionBattleAttackProfile = this.getAttackProfile(
      AttackPattern.Melee
    ),
    pattern: AttackPattern = AttackPattern.Melee
  ): HitResult {
    if (isActionBattleEntityInvincible(target)) {
      return {
        damage: 0,
        knockbackForce: 0,
        knockbackDuration: 0,
        defeated: false,
        attacker: this.event,
        target
      };
    }

    // Use RPGJS damage formula
    const { damage } = target.applyDamage(this.event as any);

    // Get knockback force from equipped weapon
    const knockbackForce = this.getWeaponKnockbackForce();
    const knockbackDuration = DEFAULT_KNOCKBACK.duration;

    // Create hit result
    let hitResult: HitResult = {
      damage,
      knockbackForce,
      knockbackDuration,
      defeated: target.hp <= 0,
      attacker: this.event,
      target
    };

    // Call onBeforeHit hook
    if (hooks?.onBeforeHit) {
      const modified = hooks.onBeforeHit(hitResult);
      if (modified) {
        hitResult = modified;
      }
    }

    // Visual feedback
    target.flash({
      type: 'tint',
      tint: 'red',
      duration: 200,
      cycles: 1
    });
    target.showHit(`-${hitResult.damage}`);
    setActionBattleInvincibility(
      target,
      profile.reaction.invincibilityMs
    );

    // Apply knockback
    if (hitResult.knockbackForce > 0) {
      const dx = target.x() - this.event.x();
      const dy = target.y() - this.event.y();
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 0) {
        const knockbackDirection = {
          x: dx / distance,
          y: dy / distance
        };
        target.knockback(knockbackDirection, hitResult.knockbackForce, hitResult.knockbackDuration);
      }
    }

    // Call onAfterHit hook
    if (hooks?.onAfterHit) {
      hooks.onAfterHit(hitResult);
    }

    return hitResult;
  }

  /**
   * Get knockback force from equipped weapon
   * 
   * Retrieves the knockbackForce property from the event's equipped weapon.
   * Falls back to DEFAULT_KNOCKBACK.force if no weapon or property is set.
   * 
   * @returns Knockback force value
   * 
   * @example
   * ```ts
   * // Weapon with knockbackForce: 80
   * const force = this.getWeaponKnockbackForce(); // 80
   * 
   * // No weapon equipped
   * const force = this.getWeaponKnockbackForce(); // 50 (default)
   * ```
   */
  private getWeaponKnockbackForce(): number {
    try {
      const equipments = (this.event as any).equipments?.() || [];
      for (const item of equipments) {
        const itemData = (this.event as any).databaseById?.(item.id());
        if (itemData?._type === 'weapon' && itemData.knockbackForce !== undefined) {
          return itemData.knockbackForce;
        }
      }
    } catch {
      // If error, return default
    }
    return DEFAULT_KNOCKBACK.force;
  }

  /**
   * Perform combo attack
   */
  private performComboAttack() {
    if (!this.target) return;

    this.comboCount++;
    const profile = this.getAttackProfile(AttackPattern.Combo);
    this.faceTarget();
    this.telegraphAttack(profile);
    playActionBattleAnimation("attack", this.event, this.animations, {
      target: this.target,
    });
    this.scheduleAttackStartup(profile, () => {
      this.executeMeleeAttack(profile, AttackPattern.Combo);
    });

    if (this.comboCount < this.comboMax) {
      this.schedule(() => {
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
    const profile = this.getAttackProfile(AttackPattern.Charged);

    this.chargingAttack = true;
    this.faceTarget();
    this.telegraphAttack(profile);
    playActionBattleAnimation(
      "attack",
      this.event,
      this.animations,
      {
        target: this.target,
      },
      { repeat: 2 }
    );

    this.scheduleAttackStartup(profile, () => {
      if (!this.target || this.state !== AiState.Combat) {
        this.chargingAttack = false;
        return;
      }
      this.executeMeleeAttack(profile, AttackPattern.Charged);
    });
    this.schedule(() => {
      this.chargingAttack = false;
    }, profile.totalDurationMs);
  }

  /**
   * Perform zone attack (360 degrees)
   */
  private performZoneAttack() {
    const profile = this.getAttackProfile(AttackPattern.Zone);
    this.telegraphAttack(profile);
    playActionBattleAnimation("attack", this.event, this.animations, {
      target: this.target ?? undefined,
    });

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

    this.scheduleAttackStartup(profile, () => {
      const map = this.event.getCurrentMap();
      map?.createMovingHitbox(hitboxes, {
        speed: resolveActionBattleHitboxSpeed(profile, hitboxes.length),
      }).subscribe({
        next: (hits: any[]) => {
          hits.forEach((hit: any) => {
            if (hit instanceof RpgPlayer && hit !== this.event) {
              this.applyHit(hit, undefined, profile, AttackPattern.Zone);
            }
          });
        },
      });
    });
  }

  /**
   * Perform dash attack
   */
  private performDashAttack() {
    if (!this.target) return;
    const profile = this.getAttackProfile(AttackPattern.DashAttack);

    const dx = this.target.x() - this.event.x();
    const dy = this.target.y() - this.event.y();
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0) return;

    const dirX = dx / dist;
    const dirY = dy / dist;

    this.faceTarget();
    this.telegraphAttack(profile);

    this.scheduleAttackStartup(profile, () => {
      if (!this.target || this.state !== AiState.Combat) return;
      this.event.dash({ x: dirX, y: dirY }, 10, 200);
      this.schedule(() => {
        if (!this.target || this.state !== AiState.Combat) return;
        this.executeMeleeAttack(profile, AttackPattern.DashAttack);
      }, 200);
    });
  }

  private getAttackProfile(
    pattern: AttackPattern
  ): NormalizedActionBattleAttackProfile {
    return this.attackProfiles[
      pattern as keyof NormalizedActionBattleEnemyAttackProfileMap
    ] ?? this.attackProfiles.melee;
  }

  private telegraphAttack(profile: NormalizedActionBattleAttackProfile) {
    if (profile.startupMs <= 0) return;
    this.event.flash({
      type: 'tint',
      tint: 'white',
      duration: Math.min(profile.startupMs, 300),
      cycles: 1
    });
  }

  private scheduleAttackStartup(
    profile: NormalizedActionBattleAttackProfile,
    callback: () => void
  ) {
    return scheduleActionBattleStartup(profile, callback, (scheduled, delay) =>
      this.schedule(scheduled, delay)
    );
  }

  /**
   * Face the current target with hysteresis to prevent animation flickering
   * 
   * Uses multiple strategies to prevent flickering:
   * 1. When very close to target (collision), keep current direction
   * 2. When near diagonal, require significant difference to change
   * 3. Only change if direction is clearly wrong (opposite)
   */
  private faceTarget() {
    if (!this.target) return;

    const dx = this.target.x() - this.event.x();
    const dy = this.target.y() - this.event.y();
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const distance = Math.sqrt(dx * dx + dy * dy);

    // When very close to target (in collision range), don't change direction
    // This prevents flickering when in melee combat
    const minDistanceForDirectionChange = 40;
    if (this.lastFacingDirection && distance < minDistanceForDirectionChange) {
      return; // Keep current direction when in collision
    }

    // Calculate the "ideal" direction
    let newDirection: string;
    if (absX >= absY) {
      newDirection = dx >= 0 ? 'right' : 'left';
    } else {
      newDirection = dy >= 0 ? 'down' : 'up';
    }

    // Hysteresis: only change direction if the difference is significant (> 20%)
    // This prevents flickering when the target is near diagonal
    const hysteresisThreshold = 0.2; // 20% difference required to change
    const ratio = absX > 0 || absY > 0 ? Math.min(absX, absY) / Math.max(absX, absY) : 0;
    
    // If ratio is close to 1 (diagonal), keep the current direction
    if (this.lastFacingDirection && ratio > (1 - hysteresisThreshold)) {
      // Near diagonal - keep current direction unless it's completely wrong
      // Only change if moving in the opposite direction
      const isOpposite = 
        (this.lastFacingDirection === 'left' && dx > 20) ||
        (this.lastFacingDirection === 'right' && dx < -20) ||
        (this.lastFacingDirection === 'up' && dy > 20) ||
        (this.lastFacingDirection === 'down' && dy < -20);
      
      if (!isOpposite) {
        return; // Keep current direction
      }
    }

    this.lastFacingDirection = newDirection;
    this.event.changeDirection(newDirection as any);
  }

  /**
   * Try to dodge
   */
  private tryDodge(): boolean {
    const currentTime = Date.now();

    if (currentTime - this.lastDodgeTime < this.dodgeCooldown) {
      this.debugLog('dodge', `Dodge on cooldown (${this.dodgeCooldown - (currentTime - this.lastDodgeTime)}ms remaining)`);
      return false;
    }
    if (Math.random() > this.dodgeChance) {
      this.debugLog('dodge', `Dodge roll failed (chance=${(this.dodgeChance * 100).toFixed(0)}%)`);
      return false;
    }
    if (!this.target) return false;

    const dx = this.target.x() - this.event.x();
    const dy = this.target.y() - this.event.y();
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0) return false;

    // Perpendicular direction
    const dodgeDirX = -dy / dist;
    const dodgeDirY = dx / dist;
    const side = Math.random() > 0.5 ? 1 : -1;

    this.debugLog('dodge', `Dodging (dir=${side > 0 ? 'right' : 'left'})`);
    this.event.dash({ x: dodgeDirX * side, y: dodgeDirY * side }, 12, 300);
    this.lastDodgeTime = currentTime;

    // Counter-attack for defensive types
    if (this.enemyType === EnemyType.Defensive && Math.random() < 0.5) {
      this.debugLog('dodge', 'Counter-attack after dodge');
      this.schedule(() => {
        if (this.target && this.state === AiState.Combat) {
          this.selectAndPerformAttack();
        }
      }, 400);
    }
    return true;
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

    this.requestMoveTo(fleeTarget as any);
  }

  /**
   * Retreat from target (temporary)
   */
  private retreatFromTarget() {
    if (!this.target) return;
    const currentTime = Date.now();
    if (currentTime - this.lastRetreatTime < this.retreatCooldown) {
      return;
    }

    const dx = this.event.x() - this.target.x();
    const dy = this.event.y() - this.target.y();
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0) return;

    this.event.dash({ x: dx / dist, y: dy / dist }, 8, 200);
    this.lastRetreatTime = currentTime;
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
    this.requestMoveTo({ x: () => waypoint.x, y: () => waypoint.y } as any);
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
      this.requestMoveTo({ x: () => formationX, y: () => formationY } as any);
    }
  }

  /**
   * Handle player entering vision
   */
  onDetectInShape(player: InstanceType<typeof RpgPlayer>, shape: any) {
    this.debugLog('vision', `Player ${player.id} entered vision (state=${this.state})`);
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
    this.debugLog('vision', `Player ${player.id} left vision (wasTarget=${this.target === player})`);
    if (this.target === player) {
      this.target = null;
      this.isMovingToTarget = false;
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
    const raw = this.event.applyDamage(attacker);
    return this.handleDamage(attacker, {
      damage: raw.damage ?? 0,
      defeated: this.event.hp <= 0,
      raw,
    });
  }

  handleDamage(
    attacker: RpgPlayer,
    damageResult: ActionBattleDamageResult & {
      reaction?: NormalizedActionBattleHitReactionProfile;
    }
  ): boolean {
    const damage = damageResult.damage;
    this.debugLog('damage', `Took ${damage} damage from ${attacker.id} (HP: ${this.event.hp}/${this.event.param[MAXHP] || '?'})`);

    // Visual feedback
    this.event.flash({
      type: 'tint',
      tint: 'red',
      duration: 200,
      cycles: 1
    });
    this.event.showHit(`-${damage}`);
    playActionBattleAnimation("hurt", this.event, this.animations, {
      attacker,
    });

    // Track damage
    this.recentDamageTaken += damage;

    const reaction = damageResult.reaction;
    const staggerPower = reaction?.staggerPower ?? damage;
    const hitstunMs = reaction?.hitstunMs ?? this.hitstunMs;
    const shouldStun = staggerPower >= this.poise && hitstunMs > 0;
    setActionBattleInvincibility(
      this.event,
      reaction?.invincibilityMs ?? this.invincibilityMs
    );

    // Brief stun
    if (shouldStun && this.state !== AiState.Stunned && this.state !== AiState.Flee) {
      this.debugLog('damage', 'Stunned from damage');
      this.isMovingToTarget = false;
      this.stunnedUntil = Date.now() + hitstunMs;
      this.changeState(AiState.Stunned);
    }

    // Check death
    if (damageResult.defeated || this.event.hp <= 0) {
      this.debugLog('damage', 'Defeated!');
      this.kill(attacker);
      return true;
    }

    return false;
  }

  /**
   * Kill this AI
   * 
   * Stops all movements, cleans up resources, calls the onDefeated hook,
   * and removes the event from the map.
   */
  private kill(attacker?: RpgPlayer) {
    const dieAnimation = playActionBattleAnimation(
      "die",
      this.event,
      this.animations,
      {
        attacker,
      }
    );
    const removeDelay = getActionBattleAnimationRemovalDelay(dieAnimation);

    // Call onDefeated hook before cleanup
    if (this.onDefeatedCallback) {
      this.onDefeatedCallback(this.event, attacker);
    }
    
    this.destroy();
    if (removeDelay > 0) {
      this.schedule(() => this.event.remove(), removeDelay);
    } else {
      this.event.remove();
    }
  }

  /**
   * Get distance between entities
   */
  private getDistance(entity1: any, entity2: any): number {
    const dx = entity1.x() - entity2.x();
    const dy = entity1.y() - entity2.y();
    return Math.sqrt(dx * dx + dy * dy);
  }

  private updateBehavior(currentTime: number) {
    if (currentTime - this.behaviorLastUpdate < this.behaviorUpdateInterval) {
      return;
    }
    this.behaviorLastUpdate = currentTime;

    let score = this.behaviorScore;
    const maxHp = this.event.param[MAXHP];
    if (maxHp) {
      const hpPercent = this.event.hp / maxHp;
      score += (hpPercent - 0.5) * 40;
    }

    if (this.recentDamageTaken > 0) {
      score -= Math.min(30, this.recentDamageTaken * 0.5);
    }

    if (this.target) {
      const distance = this.getDistance(this.event, this.target);
      if (distance <= this.attackRange) {
        score += 10;
      } else if (distance > this.visionRange) {
        score -= 10;
      }
    }

    if (this.groupBehavior && this.nearbyEnemies.length > 0) {
      score += Math.min(15, this.nearbyEnemies.length * 5);
    }

    score = Math.max(0, Math.min(100, score));
    this.behaviorScore = score;

    const previousMode = this.behaviorMode;
    if (score >= this.behaviorAssaultThreshold) {
      this.behaviorMode = 'assault';
    } else if (score <= this.behaviorRetreatThreshold) {
      this.behaviorMode = 'retreat';
    } else {
      this.behaviorMode = 'tactical';
    }

    if (previousMode !== this.behaviorMode) {
      this.debugLog('state', `Behavior mode: ${previousMode} -> ${this.behaviorMode} (score=${score.toFixed(0)})`);
    }

    if (this.behaviorMode === 'retreat' && this.state === AiState.Combat) {
      if (currentTime - this.stateStartTime >= this.behaviorMinStateDuration) {
        this.isMovingToTarget = false;
        this.changeState(AiState.Flee);
      }
    } else if (this.behaviorMode === 'assault' && this.state === AiState.Flee) {
      if (currentTime - this.stateStartTime >= this.behaviorMinStateDuration) {
        this.changeState(AiState.Combat);
      }
    }
  }

  private applyCustomBehavior(currentTime: number) {
    if (!this.behaviorKey) return;
    const behavior = getActionBattleSystems().ai.behaviors[this.behaviorKey];
    if (!behavior) return;
    const maxHp = this.event.param[MAXHP];
    const decision = behavior({
      event: this.event,
      target: this.target,
      state: this.state,
      enemyType: this.enemyType,
      distance: this.target ? this.getDistance(this.event, this.target) : null,
      hpPercent: maxHp ? this.event.hp / maxHp : null,
      now: currentTime,
    });
    if (!decision) return;
    if (decision.attackCooldown !== undefined) {
      this.attackCooldown = decision.attackCooldown;
    }
    if (decision.moveToCooldown !== undefined) {
      this.moveToCooldown = decision.moveToCooldown;
    }
    if (decision.attackPatterns?.length) {
      this.attackPatterns = decision.attackPatterns;
    }
    if (decision.mode) {
      this.behaviorMode = decision.mode;
      this.behaviorEnabled = true;
    }
  }

  private handleTacticalMovement(distance: number) {
    if (!this.target) return;
    const minRange = this.attackRange * 0.7;
    const maxRange = this.attackRange * 1.2;

    if (distance < minRange) {
      this.debugLog('movement', `Tactical retreat (dist=${distance.toFixed(1)}, minRange=${minRange.toFixed(1)})`);
      this.isMovingToTarget = false;
      this.retreatFromTarget();
      return;
    }

    if (distance > maxRange) {
      if (!this.isMovingToTarget) {
        this.debugLog('movement', `Tactical approach (dist=${distance.toFixed(1)}, maxRange=${maxRange.toFixed(1)})`);
        this.isMovingToTarget = true;
        this.requestMoveTo(this.target);
      }
      return;
    }

    if (this.isMovingToTarget) {
      this.debugLog('movement', `Tactical hold (dist=${distance.toFixed(1)})`);
      this.isMovingToTarget = false;
      this.event.stopMoveTo();
    }
  }

  private handleAssaultMovement(distance: number) {
    if (!this.target) return;
    if (distance > this.attackRange) {
      if (!this.isMovingToTarget) {
        this.debugLog('movement', `Assault approach (dist=${distance.toFixed(1)}, attackRange=${this.attackRange})`);
        this.isMovingToTarget = true;
        this.requestMoveTo(this.target);
      }
      return;
    }

    if (this.isMovingToTarget) {
      this.debugLog('movement', `Assault hold (dist=${distance.toFixed(1)})`);
      this.isMovingToTarget = false;
      this.event.stopMoveTo();
    }
  }

  private requestMoveTo(target: any): boolean {
    const currentTime = Date.now();
    if (currentTime - this.lastMoveToTime < this.moveToCooldown) {
      return false;
    }
    this.event.moveTo(target as any);
    this.lastMoveToTime = currentTime;
    return true;
  }

  private schedule(callback: () => void, delay: number) {
    const timer = setTimeout(() => {
      this.timers = this.timers.filter((entry) => entry !== timer);
      callback();
    }, delay);
    this.timers.push(timer);
    return timer;
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
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers = [];
  }
}
