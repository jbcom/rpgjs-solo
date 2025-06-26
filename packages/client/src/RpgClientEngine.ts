import Canvas from "./components/scenes/canvas.ce";
import { Context, inject } from "@signe/di";
import { signal, bootstrapCanvas } from "canvasengine";
import { AbstractWebsocket, WebSocketToken } from "./services/AbstractSocket";
import { LoadMapService, LoadMapToken } from "./services/loadMap";
import { Hooks, ModulesToken } from "@rpgjs/common";
import { load } from "@signe/sync";
import { RpgClientMap } from "./Game/Map"
import { RpgGui } from "./Gui/Gui";
import { EffectManager } from "./Game/EffectManager";
import { lastValueFrom, Observable } from "rxjs";
import { GlobalConfigToken } from "./module";
import * as PIXI from "pixi.js";

export class RpgClientEngine<T = any> {
  private guiService: RpgGui;
  private webSocket: AbstractWebsocket;
  private loadMapService: LoadMapService;
  private hooks: Hooks;
  private sceneMap: RpgClientMap = new RpgClientMap();
  private selector: HTMLElement;
  public globalConfig: T;
  public sceneComponent: any;
  stopProcessingInput = false;
  width = signal("100%");
  height = signal("100%");
  spritesheets: Map<string, any> = new Map();
  sounds: Map<string, any> = new Map();
  effects: any[] = [];
  particleSettings: {
    emitters: any[]
  } = {
    emitters: []
  }
  renderer: PIXI.Renderer;
  tick: Observable<number>;
  playerIdSignal = signal<string | null>(null);

  constructor(public context: Context) {
    this.webSocket = inject(context, WebSocketToken);
    this.guiService = inject(context, RpgGui);
    this.loadMapService = inject(context, LoadMapToken);
    this.hooks = inject<Hooks>(context, ModulesToken);
    this.globalConfig = inject(context, GlobalConfigToken)
  }

  async start() {
    this.selector = document.body.querySelector("#rpg") as HTMLElement;

    const { app, canvasElement } = await bootstrapCanvas(this.selector, Canvas);
    this.renderer = app.renderer as PIXI.Renderer;
    this.tick = canvasElement?.propObservables?.context['tick'].observable

    await lastValueFrom(this.hooks.callHooks("client-engine-onStart", this));

    // wondow is resize
    window.addEventListener('resize', () => {
      this.hooks.callHooks("client-engine-onWindowResize", this).subscribe();
    })

    this.tick.subscribe((tick) => {
      this.hooks.callHooks("client-engine-onStep", this, tick).subscribe();
    })

    this.hooks.callHooks("client-spritesheets-load", this).subscribe();
    this.hooks.callHooks("client-sounds-load", this).subscribe();
    this.hooks.callHooks("client-gui-load", this).subscribe();
    this.hooks.callHooks("client-particles-load", this).subscribe();
    this.hooks.callHooks("client-effects-load", this).subscribe();

  
    await this.webSocket.connection(() => {
      this.initListeners()
      this.guiService._initialize()
    });
  }

  private initListeners() {
    this.webSocket.on("sync", (data) => {
      if (data.pId) this.playerIdSignal.set(data.pId)
      this.hooks.callHooks("client-sceneMap-onChanges", this.sceneMap, { partial: data }).subscribe();
      load(this.sceneMap, data, true);
    });

    this.webSocket.on("changeMap", (data) => {
      this.loadScene(data.mapId);
    });

    this.webSocket.on("showEffect", (data) => {
      const { params, object, id } = data;
      if (!object) {
        throw new Error("Object not found");
      }
      const player = this.sceneMap.getObjectById(object);
      this.getEffect(id).displayEffect(params, player)
    });

    this.webSocket.on('open', () => {
      this.hooks.callHooks("client-engine-onConnected", this, this.socket).subscribe();
    })

    this.webSocket.on('close', () => {
      this.hooks.callHooks("client-engine-onDisconnected", this, this.socket).subscribe();
    })

    this.webSocket.on('error', (error) => {
      this.hooks.callHooks("client-engine-onConnectError", this, error, this.socket).subscribe();
    })
  }
  
  private async loadScene(mapId: string) {
    this.webSocket.updateProperties({ room: mapId })
    await this.webSocket.reconnect(() => {
      this.initListeners()
      this.guiService._initialize()
    })
    const res = await this.loadMapService.load(mapId)
    this.sceneMap.data.set(res)
    this.hooks.callHooks("client-sceneMap-onAfterLoading", this.sceneMap).subscribe();
    //this.sceneMap.loadPhysic()
  }

  addSpriteSheet<T = any>(spritesheetClass: any, id?: string): any {
    this.spritesheets.set(id || spritesheetClass.id, spritesheetClass);
    return spritesheetClass as any;
  }

  addSound(sound: any, id?: string) {
    this.sounds.set(id || sound.id, sound);
    return sound;
  }

  addParticle(particle: any) {
    this.particleSettings.emitters.push(particle)
    return particle;
  }

  addEffect(effect: {
    component: any,
    id: string
  }) {
    const instance = new EffectManager()
    this.effects.push({
      id: effect.id,
      component: effect.component,
      instance: instance,
      current: instance.current
    })
    return effect;
  }

  getEffect(id: string): EffectManager {
    const effect = this.effects.find((effect) => effect.id === id)
    if (!effect) {
      throw new Error(`Effect with id ${id} not found`)
    }
    return effect.instance
  }

  processInput({ input }: { input: number }) {
    this.hooks.callHooks("client-engine-onInput", this, { input, playerId: this.playerId }).subscribe();
    this.webSocket.emit('move', { input })
  }

  processAction({ action }: { action: number }) {
    if (this.stopProcessingInput) return;
    this.hooks.callHooks("client-engine-onInput", this, { input: 'action', playerId: this.playerId }).subscribe();
    this.webSocket.emit('action', { action })
  }

  get PIXI() {
    return PIXI
  }

  get socket() {
    return this.webSocket
  }
  
  get playerId() {
    return this.playerIdSignal()
  }
}
