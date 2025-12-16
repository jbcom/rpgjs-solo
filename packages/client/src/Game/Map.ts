import { RpgCommonMap } from "@rpgjs/common";
import { sync, users } from "@signe/sync";
import { RpgClientPlayer } from "./Player";
import { Signal, signal, computed } from "canvasengine";
import { RpgClientEvent } from "./Event";
import { RpgClientEngine } from "../RpgClientEngine";
import { inject } from "../core/inject";

export class RpgClientMap extends RpgCommonMap<any> {
  engine: RpgClientEngine = inject(RpgClientEngine)
  @users(RpgClientPlayer) players = signal<Record<string, RpgClientPlayer>>({});
  @sync(RpgClientEvent) events = signal<Record<string, RpgClientEvent>>({});
  currentPlayer = computed(() => this.players()[this.engine.playerIdSignal()!])

  constructor() {
    super();
    // Détecter l'environnement de test
    const isTest = (typeof process !== 'undefined' && process.env?.TEST === 'true') 
      || (typeof window !== 'undefined' && (window as any).__RPGJS_TEST__ === true);
    if (isTest) {
      this.autoTickEnabled = false;
    }
  }

  getCurrentPlayer() {
    return this.currentPlayer()
  }

  reset() {
    this.players.set({})
    this.events.set({})
    this.clearPhysic()
  }

  stepPredictionTick(): void {
    this.forceSingleTick();
  }
}
