import { describe, expect, it, vi } from 'vitest'
import { loadSoloTiledMap } from './tiled'

const MAP = `<?xml version="1.0" encoding="UTF-8"?>
<map version="1.10" tiledversion="1.11.2" orientation="orthogonal" renderorder="right-down" width="2" height="2" tilewidth="16" tileheight="16" infinite="0" nextlayerid="3" nextobjectid="2">
  <tileset firstgid="1" source="tiles/terrain.tsx"/>
  <layer id="1" name="Ground" width="2" height="2"><data encoding="csv">1,0,0,0</data></layer>
  <objectgroup id="2" name="Positions"><object id="1" name="start" x="24" y="24"><point/></object></objectgroup>
</map>`

const TILESET = `<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" tiledversion="1.11.2" name="terrain" tilewidth="16" tileheight="16" tilecount="1" columns="1">
  <image source="../../images/terrain.png" width="16" height="16"/>
  <tile id="0"><properties><property name="collision" type="bool" value="true"/></properties></tile>
</tileset>`

describe('loadSoloTiledMap', () => {
  it('loads nested TSX assets and derives runtime collision and authoring metadata', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const value = String(url)
      if (value.endsWith('/maps/field.tmx')) return new Response(MAP)
      if (value.endsWith('/maps/tiles/terrain.tsx')) return new Response(TILESET)
      return new Response('missing', { status: 404, statusText: 'Not Found' })
    })

    const map = await loadSoloTiledMap({ id: 'field', basePath: 'https://game.test/maps', fetch: fetcher })

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(map.runtime).toMatchObject({
      id: 'field',
      width: 32,
      height: 32,
      tileWidth: 16,
      tileHeight: 16,
      obstacles: [{ id: 'tiled:0,0', x: 0, y: 0, width: 16, height: 16 }],
      data: { startPositions: { start: { x: 24, y: 24 } } }
    })
    expect(map.parsedMap.tilesets[0].image.source).toBe('https://game.test/images/terrain.png')
  })

  it('fails with the exact authoring asset that could not be loaded', async () => {
    await expect(loadSoloTiledMap({
      id: 'missing',
      basePath: '/maps',
      fetch: vi.fn(async () => new Response('', { status: 404, statusText: 'Not Found' }))
    })).rejects.toThrow("Unable to load Tiled map '/maps/missing.tmx': 404 Not Found")
  })
})
