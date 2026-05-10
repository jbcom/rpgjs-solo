import {
  RpgCommonMap,
  type WeatherState,
  type MapPhysicsInitContext,
  type MapPhysicsEntityContext,
} from "@rpgjs/common";
import { sync, users } from "@signe/sync";
import { RpgClientPlayer } from "./Player";
import { Signal, signal, computed, effect } from "canvasengine";
import { RpgClientEvent } from "./Event";
import { RpgClientEngine } from "../RpgClientEngine";
import { inject } from "../core/inject";

type TestGlobalScope = typeof globalThis & {
  process?: {
    env?: {
      TEST?: string;
    };
  };
  __RPGJS_TEST__?: boolean;
};

export class RpgClientMap extends RpgCommonMap<any> {
  engine: RpgClientEngine = inject(RpgClientEngine)
  @users(RpgClientPlayer) players = signal<Record<string, RpgClientPlayer>>({});
  @sync(RpgClientEvent) events = signal<Record<string, RpgClientEvent>>({});
  currentPlayer = computed(() => this.players()[this.engine.playerIdSignal()!])
  weatherState = signal<WeatherState | null>(null);
  localWeatherOverride = signal<WeatherState | null>(null);
  weather = computed<WeatherState | null>(() => {
    const local = this.localWeatherOverride() 
    const state = this.weatherState()
    return local ?? state
  });
  private manualClientPhysicsTick = false;
  private readonly isTestEnvironment: boolean;

  constructor() {
    super();
    // Détecter l'environnement de test
    const testGlobal = globalThis as TestGlobalScope;
    const isTest = testGlobal.process?.env?.TEST === 'true'
      || testGlobal.__RPGJS_TEST__ === true;
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
    this.weatherState.set(null);
    this.localWeatherOverride.set(null);
    this.clearPhysic()
  }

  getWeather(): WeatherState | null {
    return this.weather();
  }

  setLocalWeather(next: WeatherState | null): void {
    this.localWeatherOverride.set(next);
  }

  clearLocalWeather(): void {
    this.localWeatherOverride.set(null);
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

  protected emitPhysicsInit(context: MapPhysicsInitContext): void {
    this.engine?.emitSceneMapHook?.("onPhysicsInit", this, context);
  }

  protected emitPhysicsEntityAdd(context: MapPhysicsEntityContext): void {
    this.engine?.emitSceneMapHook?.("onPhysicsEntityAdd", this, context);
  }

  protected emitPhysicsEntityRemove(context: MapPhysicsEntityContext): void {
    this.engine?.emitSceneMapHook?.("onPhysicsEntityRemove", this, context);
  }

  protected emitPhysicsReset(): void {
    this.engine?.emitSceneMapHook?.("onPhysicsReset", this);
  }
}
