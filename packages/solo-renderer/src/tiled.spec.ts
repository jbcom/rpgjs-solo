import { describe, expect, it, vi } from 'vitest'
import { loadSoloTiledMap } from './tiled'

const MAP = `<?xml version="1.0" encoding="UTF-8"?>
<map version="1.10" tiledversion="1.11.2" orientation="orthogonal" renderorder="right-down" width="2" height="2" tilewidth="16" tileheight="16" infinite="0" nextlayerid="4" nextobjectid="2">
  <tileset firstgid="1" source="tiles/terrain.tsx"/>
  <layer id="1" name="Ground" width="2" height="2"><data encoding="csv">3,3,3,3</data></layer>
  <layer id="2" name="Collision" width="2" height="2"><data encoding="csv">1,2,0,0</data></layer>
  <objectgroup id="3" name="Positions"><object id="1" name="start" x="24" y="24"><point/></object></objectgroup>
</map>`

const TILESET = `<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" tiledversion="1.11.2" name="terrain" tilewidth="16" tileheight="16" tilecount="3" columns="3">
  <image source="../../images/terrain.png" width="48" height="16"/>
  <tile id="0"><objectgroup><object id="7" x="2" y="3" width="8" height="10"/></objectgroup></tile>
  <tile id="1"><properties><property name="collision" type="bool" value="true"/></properties></tile>
</tileset>`

describe('loadSoloTiledMap', () => {
  it('loads nested TSX assets and derives multi-layer property and object-group collision', async () => {
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
      obstacles: [
        { id: 'tiled:0,0:1:7', x: 6, y: 8, width: 8, height: 10 },
        { id: 'tiled:1,0:1', x: 24, y: 8, width: 16, height: 16 }
      ],
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
