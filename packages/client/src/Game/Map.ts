import { RpgCommonMap } from "@rpgjs/common";
import { sync, users } from "@signe/sync";
import { RpgClientPlayer } from "./Player";
import { Signal, signal, computed, effect } from "canvasengine";
import { RpgClientEvent } from "./Event";
import { RpgClientEngine } from "../RpgClientEngine";
import { inject } from "../core/inject";

export class RpgClientMap extends RpgCommonMap<any> {
  engine: RpgClientEngine = inject(RpgClientEngine)
  @users(RpgClientPlayer) players = signal<Record<string, RpgClientPlayer>>({});
  @sync(RpgClientEvent) events = signal<Record<string, RpgClientEvent>>({});
  currentPlayer = computed(() => this.players()[this.engine.playerIdSignal()!])
  private manualClientPhysicsTick = false;
  private readonly isTestEnvironment: boolean;

  constructor() {
    super();
    // Détecter l'environnement de test
    const isTest = (typeof process !== 'undefined' && process.env?.TEST === 'true')
      || (typeof window !== 'undefined' && (window as any).__RPGJS_TEST__ === true);
    this.isTestEnvironment = isTest;
    if (isTest) {
      this.autoTickEnabled = false;
    }
  }

  configureClientPrediction(enabled: boolean): void {
    this.manualClientPhysicsTick = enabled;
    this.autoTickEnabled = enabled ? false : !this.isTestEnvironment;
  }

  getCurrentPlayer() {
    return this.currentPlayer()
  }

  reset(force = false) {
    const currentPlayerId = this.engine.playerIdSignal();
    const currentPlayer = !force && currentPlayerId
      ? this.players()[currentPlayerId]
      : undefined;

    this.players.set(
      currentPlayerId && currentPlayer ? { [currentPlayerId]: currentPlayer } : {}
    );
    this.events.set({})
    this.clearPhysic()
  }

  stepClientPhysics(deltaMs: number): number {
    if (!this.manualClientPhysicsTick) {
      return 0;
    }
    return this.nextTick(deltaMs);
  }

  stepPredictionTick(): void {
    this.forceSingleTick();
  }
}
