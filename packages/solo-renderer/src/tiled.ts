import { MapClass, TiledParser, type TiledLayer, type TiledMap, type TiledObject } from '@canvasengine/tiled'
import type { SoloObstacleDefinition } from '@jbcom/rpgjs-solo'
import type { SoloRenderedMap } from './types'

export interface LoadSoloTiledMapOptions {
  id: string
  basePath?: string
  fileName?: string
  fetch?: typeof globalThis.fetch
}

const joinUrl = (base: string, path: string): string => {
  if (path.startsWith('/') || /^(?:[a-z]+:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) return path
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  try {
    return new URL(path, normalizedBase).toString()
  } catch {
    const parts = `${normalizedBase}${path}`.split('/')
    const resolved: string[] = []
    for (const part of parts) {
      if (part === '..') resolved.pop()
      else if (part !== '.') resolved.push(part)
    }
    return resolved.join('/').replace(':/', '://')
  }
}

const directoryOf = (url: string): string => url.slice(0, Math.max(0, url.lastIndexOf('/') + 1))

const fetchText = async (fetcher: typeof globalThis.fetch, url: string, kind: string): Promise<string> => {
  const response = await fetcher(url)
  if (!response.ok) throw new Error(`Unable to load ${kind} '${url}': ${response.status} ${response.statusText}`)
  return response.text()
}

const resolveTilesets = async (
  map: TiledMap,
  mapUrl: string,
  fetcher: typeof globalThis.fetch
): Promise<void> => {
  const resolved = []
  for (const entry of map.tilesets ?? []) {
    const source = (entry as { source?: string }).source
    if (!source) {
      const inline = { ...entry }
      if (inline.image?.source) inline.image = { ...inline.image, source: joinUrl(directoryOf(mapUrl), inline.image.source) }
      resolved.push(inline)
      continue
    }

    const tilesetUrl = joinUrl(directoryOf(mapUrl), source)
    const xml = await fetchText(fetcher, tilesetUrl, 'Tiled tileset')
    const parsed = new TiledParser(xml, tilesetUrl, directoryOf(tilesetUrl)).parseTileset()
    if (parsed.image?.source) {
      parsed.image.source = joinUrl(directoryOf(tilesetUrl), parsed.image.source)
    }
    resolved.push({ ...entry, ...parsed })
  }
  map.tilesets = resolved
}

interface CollisionBounds {
  x: number
  y: number
  width: number
  height: number
}

const collisionObjectBounds = (object: TiledObject): CollisionBounds | null => {
  const points = object.polygon ?? object.polyline
  if (!points?.length) {
    const bounds = { x: 0, y: 0, width: object.width ?? 0, height: object.height ?? 0 }
    return bounds.width > 0 && bounds.height > 0 ? bounds : null
  }
  const finitePoints = points.filter(
    (point) => Number.isFinite(point.x) && Number.isFinite(point.y)
  )
  if (finitePoints.length === 0) return null
  const xs = finitePoints.map((point) => point.x)
  const ys = finitePoints.map((point) => point.y)
  const minimumX = Math.min(...xs)
  const minimumY = Math.min(...ys)
  const bounds = {
    x: minimumX,
    y: minimumY,
    width: Math.max(...xs) - minimumX,
    height: Math.max(...ys) - minimumY
  }
  return bounds.width > 0 && bounds.height > 0 ? bounds : null
}

const collisionObstacles = (map: MapClass): SoloObstacleDefinition[] => {
  const obstacles: SoloObstacleDefinition[] = []
  const obstacleIds = new Set<string>()
  const pushObstacle = (obstacle: SoloObstacleDefinition): void => {
    if (obstacleIds.has(obstacle.id)) return
    obstacleIds.add(obstacle.id)
    obstacles.push(obstacle)
  }
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const tileInfo = map.getTileByPosition(x * map.tilewidth, y * map.tileheight, [0, 0], { populateTiles: true })
      for (const [tileIndex, tile] of tileInfo.tiles.entries()) {
        const collisionObjects = tile.objects ?? []
        if (!tile.getProperty<boolean, boolean>('collision', false) && collisionObjects.length === 0) continue

        const tileX = x * map.tilewidth
        const tileY = y * map.tileheight
        const objectObstacles = collisionObjects.flatMap((object, objectIndex) => {
          const bounds = collisionObjectBounds(object)
          if (!bounds) return []
          const objectX = Number.isFinite(object.x) ? object.x : 0
          const objectY = Number.isFinite(object.y) ? object.y : 0
          const left = tileX + objectX + bounds.x
          const top = tileY + objectY + bounds.y
          return [{
            id: `tiled:${x},${y}:${tile.layerIndex ?? tileIndex}:${object.id ?? objectIndex}`,
            x: left + bounds.width / 2,
            y: top + bounds.height / 2,
            width: bounds.width,
            height: bounds.height
          }]
        })
        if (objectObstacles.length > 0) {
          for (const obstacle of objectObstacles) pushObstacle(obstacle)
          continue
        }
        pushObstacle({
          id: `tiled:${x},${y}:${tile.layerIndex ?? tileIndex}`,
          x: tileX + map.tilewidth / 2,
          y: tileY + map.tileheight / 2,
          width: map.tilewidth,
          height: map.tileheight
        })
      }
    }
  }
  return obstacles
}

const layerObjects = (layers: readonly TiledLayer[] = []): TiledObject[] => {
  const objects: TiledObject[] = []
  for (const layer of layers) {
    const layerWithObjects = layer as TiledLayer & { objects?: TiledObject[]; layers?: TiledLayer[] }
    if (Array.isArray(layerWithObjects.objects)) objects.push(...layerWithObjects.objects)
    if (Array.isArray(layerWithObjects.layers)) objects.push(...layerObjects(layerWithObjects.layers))
  }
  return objects
}

const startPositions = (map: TiledMap): Record<string, { x: number; y: number }> => {
  const positions: Record<string, { x: number; y: number }> = {}
  for (const object of layerObjects(map.layers)) {
    if (!object.point || typeof object.x !== 'number' || typeof object.y !== 'number') continue
    if (object.name) positions[object.name] = { x: object.x, y: object.y }
    if (!positions.start && (object.class === 'start' || object.type === 'start')) {
      positions.start = { x: object.x, y: object.y }
    }
  }
  return positions
}

/** Loads the same TMX/TSX authoring format as RPGJS without installing its transport-backed client. */
export const loadSoloTiledMap = async (options: LoadSoloTiledMapOptions): Promise<SoloRenderedMap> => {
  const fetcher = options.fetch ?? globalThis.fetch
  if (!fetcher) throw new Error('A fetch implementation is required to load a Tiled map')
  const basePath = options.basePath ?? 'map'
  const mapUrl = joinUrl(basePath, options.fileName ?? `${options.id}.tmx`)
  const xml = await fetchText(fetcher, mapUrl, 'Tiled map')
  const parsedMap = new TiledParser(xml, mapUrl, directoryOf(mapUrl)).parseMap()
  await resolveTilesets(parsedMap, mapUrl, fetcher)
  const map = new MapClass(parsedMap)

  return {
    id: options.id,
    basePath: directoryOf(mapUrl),
    parsedMap,
    runtime: {
      id: options.id,
      width: map.widthPx,
      height: map.heightPx,
      tileWidth: map.tilewidth,
      tileHeight: map.tileheight,
      obstacles: collisionObstacles(map),
      data: { startPositions: startPositions(parsedMap) }
    }
  }
}
