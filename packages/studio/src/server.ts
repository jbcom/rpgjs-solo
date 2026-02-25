import { Move, RpgEvent, RpgMap, RpgPlayer, RpgServer } from "@rpgjs/server";
import { defineModule, WorldMapsManager } from "@rpgjs/common";
import { BlockExecutionService } from "./block-executor";
import { apiUrl } from "./constants";
import { RATIO_MAP_X, RATIO_MAP_Y } from "@common/map";
import { matchesPageConditions } from "@common/blocks";
import {
  applyTriggerSettings,
  getEventTypeRuntime,
  getGraphicKey,
  RpgMapExtended,
} from "./event-type-runtime";
import { normalizeEventType } from "@common/event-types";
import { assignParams } from "./assign-params";
import { normalizeWeatherState } from "@common/weather";
import { getGameDataProvider } from "./data-provider";


let cacheDatabase: any = null

export default defineModule<RpgServer>({
  player: {
    onStart: (player: RpgPlayer) => {
     // startGame(player);
      player.changeMap('simplemap')
    },
    onConnected: (player: RpgPlayer) => {
      // if (!gameParam) {
      //   //startGame(player);
      //   player.allRecovery()
      //   player.changeMap('simplemap')
      // }
    },
    onJoinMap: (player: RpgPlayer, map: RpgMap) => {
      const startMapId = map.globalConfig.startMapId;
      const isStartMap = map.data().data._id === startMapId;
      const mapExtended = map as RpgMapExtended;
      const heroGraphic = (mapExtended.globalConfig.hero as any)?.graphic;
      const heroGraphicKey = getGraphicKey(heroGraphic);
      if (heroGraphicKey) {
        player.setGraphic(heroGraphicKey);
      } else {
        player.setGraphic("default_character");
      }
      if (player.x() == 0 && player.y() == 0) {
        player.teleport({
          x: (mapExtended.startPosition?.x ?? 0) * mapExtended.scale,
          y: (mapExtended.startPosition?.y ?? 0) * mapExtended.scale,
        });
      }
    },
    onInput: (player: RpgPlayer, input: { action: string}) => {
      if (input.action == 'escape') {
        player.callMainMenu({
          menus: [
            {
              id: 'items',
              label: 'Items',
            },
            {
              id: 'equip',
              label: 'Equipment',
            },
            {
              id: 'save',
              label: 'Save',
            }
          ]
        })
      }
    },
    onDead: async (player: RpgPlayer) => {
      const selection = await player.callGameover();
      if (selection?.id === 'title') {
        await player.gui('rpg-title-screen').open()
      }
      else if (selection?.id === 'load') {
        await player.showLoad();
      }
    },
    onLevelUp: async (player: RpgPlayer, nbLevel: number) => {
      player.showNotification(`You reached level ${player.level}`)
    }
  },
  map: {
    async onBeforeUpdate(mapData: any, map) {
      const mapExtended = map as RpgMapExtended;
      mapExtended.startPosition = mapData.data.start;
      mapExtended.scale = mapData.data.params.scale || 1;
      const normalizedInitialWeather = normalizeWeatherState(mapData?.data?.weather);
      mapData.data.weather = normalizedInitialWeather;
      // Add baseUrl to map context for use in block executors
      (mapExtended as any).apiBaseUrl = apiUrl;

      if (mapData.config.worldMaps) {
        const worldManager = new WorldMapsManager();
        const worldMaps = mapData.config.worldMaps.map((worldMap: any) => ({
          ...worldMap,
          worldX: worldMap.worldX * RATIO_MAP_X,
          worldY: worldMap.worldY * RATIO_MAP_Y,
        }));
        worldManager.configure(worldMaps);
        mapExtended.setInWorldMaps(worldManager);
      }

      return map as any;
    },
  },
  event: {
    onBeforeCreated({ event: object }, map: RpgMap) {
      const mapExtended = map as RpgMapExtended;

      const params = object.params;
      const scale = mapExtended.scale;
      const eventType =
        normalizeEventType(object.eventType || object.type || "character") ||
        "character";
      const runtime = getEventTypeRuntime(eventType);

      // Add block execution utility to the event
      const eventObj: any = {};

      // If the event has triggers defined, add execution methods
      if (object.triggers && Array.isArray(object.triggers)) {
        eventObj.resolveActiveTrigger = function (
          player: RpgPlayer | null,
          event: RpgEvent
        ) {
          for (let i = object.triggers.length-1; i >= 0; i--) {
            const trigger = object.triggers[i];
            if (matchesPageConditions(trigger.conditions, { player, event }) && trigger.enabled) {
              return { trigger, index: i };
            }
          }
          return null;
        };

        eventObj.applyActiveTrigger = function (
          player: RpgPlayer | null,
          event: RpgEvent
        ) {
          const resolved = eventObj.resolveActiveTrigger(player, event);
          if (!resolved) return null;
          if (eventObj.__activeTriggerIndex !== resolved.index) {
            eventObj.__activeTriggerIndex = resolved.index;
            applyTriggerSettings({
              event,
              trigger: resolved.trigger,
              fallbackParams: params,
              eventType,
              object,
            });
          }
          return resolved.trigger;
        };

        eventObj.executeBlocks = async function (
          player: RpgPlayer | null,
          triggerType: string,
          event: RpgEvent
        ) {
          const blockExecutor = new BlockExecutionService(player, event);
          const trigger = eventObj.applyActiveTrigger(player, event);
          if (!trigger || trigger.type !== triggerType) {
            return;
          }
          if (trigger && trigger.blocks) {
            await blockExecutor.executeBlockSequence(trigger.blocks);
          }
        };

        // Add trigger-specific execution methods
        eventObj.onInit = async function () {
          setTimeout(async () => {
            const map = this.getCurrentMap();
            const [player] = map?.getPlayers() ?? [];
            const runParallelLoop = () => {
              const loop = () => {
                eventObj.executeBlocks(player, "onParallel", this).then(() => {
                  setTimeout(loop, 1000);
                });
              };
              loop();
            };
            const runInitLifecycle = async (options?: {
              runInitBlocks?: boolean;
              startParallelLoop?: boolean;
            }) => {
              eventObj.applyActiveTrigger(player, this);
              this.teleport({
                x: object.x * mapExtended.scale,
                y: object.y * mapExtended.scale,
              });
              if (options?.runInitBlocks !== false) {
                await eventObj.executeBlocks(player, "onInit", this);
              }
              if (options?.startParallelLoop !== false) {
                runParallelLoop();
              }
            };
            const context = {
              event: this,
              player,
              map,
              object,
              params,
              eventType,
              triggerType: "onInit",
              resolveActiveTrigger: eventObj.resolveActiveTrigger,
              applyActiveTrigger: eventObj.applyActiveTrigger,
              executeBlocks: eventObj.executeBlocks,
              runInitLifecycle,
            };

            const defaultHandler = () => runInitLifecycle();
            if (runtime.hooks?.onInit) {
              await runtime.hooks.onInit(context, defaultHandler);
            } else {
              await defaultHandler();
            }
          }, 0);
        };

        const createContext = (player: RpgPlayer, event: RpgEvent, triggerType: string) => {
          return {
            event,
            player,
            map,
            object,
            params,
            resolveActiveTrigger: eventObj.resolveActiveTrigger,
            applyActiveTrigger: eventObj.applyActiveTrigger,
            executeBlocks: eventObj.executeBlocks,
            eventType,
            triggerType,
            moveApi: Move,
          };
        };

        eventObj.onAction = async function (player: RpgPlayer) {
          const context = createContext(player, this, "onAction");
          const defaultHandler = async () => {
            await eventObj.executeBlocks(player, "onAction", this);
            player.syncChanges();
          };
          if (runtime.hooks?.onAction) {
            await runtime.hooks.onAction(context, defaultHandler);
          } else {
            await defaultHandler();
          }
        };

        eventObj.onPlayerTouch = async function (player: RpgPlayer) {
          const context = createContext(player, this, "onTouch");
          const defaultHandler = async () => {
            await eventObj.executeBlocks(player, "onTouch", this);
            player.syncChanges();
          };
          if (runtime.hooks?.onTouch) {
            await runtime.hooks.onTouch(context, defaultHandler);
          } else {
            await defaultHandler();
          }
        };

        eventObj.onChanges = async function (player: RpgPlayer) {
          const context = createContext(player, this, "onChange");
          const defaultHandler = async () => {
            eventObj.applyActiveTrigger(player, this);
            await eventObj.executeBlocks(player, "onChange", this);
          };
          if (runtime.hooks?.onChange) {
            await runtime.hooks.onChange(context, defaultHandler);
          } else {
            await defaultHandler();
          }
        };
      }

      return {
        event: eventObj,
        x: object.x * mapExtended.scale,
        y: object.y * mapExtended.scale,
        id: object.eventId,
      };
    },
  },
  database: async () => {
    if (cacheDatabase) {
      return cacheDatabase
    }
    const gameConfig = window.gameConfig;
    const response = await getGameDataProvider().getDatabase(gameConfig?._id);
    const database: any = {}
    for (const item of response) {
      item.id = item._id;
      item._type = item.itemType;
      delete item.itemType;
      delete item._id;
      database[item.id] = item;
    }
    cacheDatabase = database
    return database
  }
});
