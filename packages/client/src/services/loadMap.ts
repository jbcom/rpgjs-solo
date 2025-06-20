import { Context, inject } from "@signe/di";
import { UpdateMapToken, UpdateMapService } from "@rpgjs/common";

export const LoadMapToken = 'LoadMapToken'

export type LoadMapOptions = (mapId: string) => Promise<void>

export class LoadMapService {
  private updateMapService: UpdateMapService;

  constructor(private context: Context, private options: LoadMapOptions) {
    if (context['side'] === 'server') {
      return
    }
    this.updateMapService = inject(context, UpdateMapToken);
  }

  async load(mapId: string) {
    const map = await this.options(mapId.replace('map-', ''))
    await this.updateMapService.update(mapId, map);
    return map;
  }
}

export function provideLoadMap(options: LoadMapOptions) {
  return [
    {
      provide: UpdateMapToken,
      useFactory: (context: Context) => {
        if (context['side'] === 'client') {
          console.warn('UpdateMapToken is not overridden')
        }
        return
      },
    },
    {
      provide: LoadMapToken,
      useFactory: (context: Context) => new LoadMapService(context, options),
    },
  ];
}
