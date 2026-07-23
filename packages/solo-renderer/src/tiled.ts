import { MapClass, TiledParser, type TiledLayer, type TiledMap, type TiledObject } from '@canvasengine/tiled'
import type { SoloObstacleDefinition } from '@jbcom/rpgjs-solo'
import type { SoloRenderedMap } from './types'

export interface LoadSoloTiledMapOptions {
  id: string
  basePath?: string
  fileName?: string
  fetch?: typeof globalThis.fetch
}

export interface SoloTiledLayerUpdate {
  name: string
  data: ArrayLike<number>
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
    // Parse the TSX path unchanged, then resolve it exactly once here. Passing
    // the tileset path into TiledParser resolves the image internally; joining
    // that result again below duplicates relative map directories.
    const parsed = new TiledParser(xml).parseTileset()
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
  const authoredPoints = object.polygon ?? object.polyline
  const points = authoredPoints?.length
    ? authoredPoints
    : Number.isFinite(object.width) && Number.isFinite(object.height)
      && object.width > 0 && object.height > 0
      ? [
          { x: 0, y: 0 },
          { x: object.width, y: 0 },
          { x: object.width, y: object.height },
          { x: 0, y: object.height }
        ]
      : []
  const finitePoints = points.filter(
    (point) => Number.isFinite(point.x) && Number.isFinite(point.y)
  )
  if (finitePoints.length === 0) return null
  const radians = (Number.isFinite(object.rotation) ? object.rotation : 0) * Math.PI / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const stableCoordinate = (value: number): number =>
    Math.abs(value) <= 1e-10 ? 0 : Number(value.toFixed(10))
  const transformed = finitePoints.map((point) => ({
    x: stableCoordinate(point.x * cosine - point.y * sine),
    y: stableCoordinate(point.x * sine + point.y * cosine)
  }))
  const xs = transformed.map((point) => point.x)
  const ys = transformed.map((point) => point.y)
  let minimumX = Math.min(...xs)
  let minimumY = Math.min(...ys)
  let width = Math.max(...xs) - minimumX
  let height = Math.max(...ys) - minimumY
  if (object.polyline?.length) {
    if (width <= Number.EPSILON) {
      minimumX -= 0.5
      width = 1
    }
    if (height <= Number.EPSILON) {
      minimumY -= 0.5
      height = 1
    }
  }
  const bounds = {
    x: minimumX,
    y: minimumY,
    width,
    height
  }
  return bounds.width > 0 && bounds.height > 0 ? bounds : null
}

interface TileRectangle {
  x: number
  y: number
  width: number
  height: number
}

export interface SoloTileCollisionGrid {
  id: string
  width: number
  height: number
  tileWidth: number
  tileHeight: number
  cells: ArrayLike<number>
}

/** Coalesces a tile collision grid into stable rectangular Solo obstacles. */
export const createSoloTileObstacles = (
  grid: SoloTileCollisionGrid
): SoloObstacleDefinition[] => {
  if (
    !grid.id
    || !Number.isInteger(grid.width)
    || !Number.isInteger(grid.height)
    || grid.width <= 0
    || grid.height <= 0
    || !Number.isFinite(grid.tileWidth)
    || !Number.isFinite(grid.tileHeight)
    || grid.tileWidth <= 0
    || grid.tileHeight <= 0
    || grid.cells.length !== grid.width * grid.height
  ) {
    throw new TypeError(`Invalid Solo tile collision grid: ${grid.id || '<unnamed>'}`)
  }
  const rectangles: TileRectangle[] = []
  let active = new Map<string, TileRectangle>()
  for (let y = 0; y < grid.height; y += 1) {
    const runs: Array<{ x: number; width: number }> = []
    let start = -1
    for (let x = 0; x <= grid.width; x += 1) {
      const filled = x < grid.width && grid.cells[y * grid.width + x] === 1
      if (filled && start < 0) start = x
      if (!filled && start >= 0) {
        runs.push({ x: start, width: x - start })
        start = -1
      }
    }

    const next = new Map<string, TileRectangle>()
    for (const run of runs) {
      const key = `${run.x}:${run.width}`
      const previous = active.get(key)
      const rectangle = previous
        ? { ...previous, height: previous.height + 1 }
        : { x: run.x, y, width: run.width, height: 1 }
      next.set(key, rectangle)
    }
    for (const [key, rectangle] of active) {
      if (!next.has(key)) rectangles.push(rectangle)
    }
    active = next
  }
  rectangles.push(...active.values())

  return rectangles.map((rectangle) => ({
    id: `tiled:${grid.id}:tiles:${rectangle.x},${rectangle.y}:${rectangle.width}x${rectangle.height}`,
    x: (rectangle.x + rectangle.width / 2) * grid.tileWidth,
    y: (rectangle.y + rectangle.height / 2) * grid.tileHeight,
    width: rectangle.width * grid.tileWidth,
    height: rectangle.height * grid.tileHeight
  }))
}

const collisionObstacles = (map: MapClass, mapId: string): SoloObstacleDefinition[] => {
  const obstacles: SoloObstacleDefinition[] = []
  const fullTileCells = new Uint8Array(map.width * map.height)
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
          const fullTile = objectObstacles.some(
            (obstacle) =>
              obstacle.x === tileX + map.tilewidth / 2 &&
              obstacle.y === tileY + map.tileheight / 2 &&
              obstacle.width === map.tilewidth &&
              obstacle.height === map.tileheight
          )
          if (fullTile) {
            fullTileCells[y * map.width + x] = 1
            continue
          }
          for (const obstacle of objectObstacles) pushObstacle(obstacle)
          continue
        }
        fullTileCells[y * map.width + x] = 1
      }
    }
  }
  for (const obstacle of createSoloTileObstacles({
    id: mapId,
    width: map.width,
    height: map.height,
    tileWidth: map.tilewidth,
    tileHeight: map.tileheight,
    cells: fullTileCells
  })) pushObstacle(obstacle)
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
    revision: 0,
    basePath: directoryOf(mapUrl),
    parsedMap,
    runtime: {
      id: options.id,
      width: map.widthPx,
      height: map.heightPx,
      tileWidth: map.tilewidth,
      tileHeight: map.tileheight,
      obstacles: collisionObstacles(map, options.id),
      data: { startPositions: startPositions(parsedMap) }
    }
  }
}

/**
 * Returns a revisioned rendered map with one or more complete Tiled tile layers
 * replaced. The source map is not mutated, so registering the result can safely
 * retire an already-mounted CanvasEngine scene.
 */
export const replaceSoloTiledLayers = (
  map: SoloRenderedMap,
  updates: readonly SoloTiledLayerUpdate[]
): SoloRenderedMap => {
  if (updates.length === 0) return map
  const updateByName = new Map<string, number[]>()
  for (const update of updates) {
    if (!update.name) throw new TypeError('A Solo Tiled layer update requires a name')
    if (updateByName.has(update.name)) {
      throw new TypeError(`Duplicate Solo Tiled layer update: ${update.name}`)
    }
    const data = Array.from(update.data)
    if (data.some((gid) => !Number.isInteger(gid) || gid < 0 || gid > 0xffffffff)) {
      throw new TypeError(`Solo Tiled layer '${update.name}' contains an invalid GID`)
    }
    updateByName.set(update.name, data)
  }

  const matches = new Map([...updateByName.keys()].map((name) => [name, 0]))
  const reviseLayers = (layers: readonly TiledLayer[] = []): TiledLayer[] => layers.map((layer) => {
    const nestedLayer = layer as TiledLayer & { layers?: TiledLayer[] }
    const nested = nestedLayer.layers ? reviseLayers(nestedLayer.layers) : undefined
    const replacement = updateByName.get(layer.name)
    if (!replacement) return nested ? { ...layer, layers: nested } as TiledLayer : layer
    if (layer.type !== 'tilelayer') {
      throw new TypeError(`Solo Tiled layer '${layer.name}' is not a tile layer`)
    }
    const expected = layer.width * layer.height
    if (replacement.length !== expected) {
      throw new RangeError(
        `Solo Tiled layer '${layer.name}' expected ${expected} GIDs, received ${replacement.length}`
      )
    }
    matches.set(layer.name, (matches.get(layer.name) ?? 0) + 1)
    return { ...layer, data: [...replacement], ...(nested ? { layers: nested } : {}) } as TiledLayer
  })
  const layers = reviseLayers(map.parsedMap.layers)
  for (const [name, count] of matches) {
    if (count === 0) throw new Error(`Solo Tiled map '${map.id}' has no tile layer named '${name}'`)
    if (count > 1) {
      throw new Error(`Solo Tiled map '${map.id}' has multiple tile layers named '${name}'`)
    }
  }
  return {
    ...map,
    revision: (map.revision ?? 0) + 1,
    parsedMap: { ...map.parsedMap, layers }
  }
}
