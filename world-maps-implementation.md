# World Maps Implementation

## Overview

Implementation of a world maps system allowing automatic change between adjacent maps when a player touches the map borders.

## Analyzed existing architecture

### Found structures:
- **RpgMap** (`packages/server/src/rooms/map.ts`) : Main map class
- **RpgTiledMap** (`packages/tiledmap/src/server.ts`) : Extension for Tiled maps
- **RpgPlayer** (`packages/server/src/Player/Player.ts`) : Players with `changeMap` method
- **RpgCommonPhysic** (`packages/common/src/Physic.ts`) : Physics and collision system

### Existing features:
- `player.changeMap(mapId, position)` : Manual map change
- x, y coordinate system for players
- Map border detection via static hitboxes
- `widthPx`, `heightPx` properties in Tiled maps

## Required interfaces

```typescript
// Interface for world map information
export interface WorldMapInfo {
  id: string;
  x: number;           // World X position
  y: number;           // World Y position
  width: number;       // Width in pixels
  height: number;      // Height in pixels
  worldX: number;      // World X coordinate (alias for x)
  worldY: number;      // World Y coordinate (alias for y)
  widthPx: number;     // Width in pixels (alias for width)
  heightPx: number;    // Height in pixels (alias for height)
  tileWidth: number;   // Tile width
  tileHeight: number;  // Tile height
}

// Configuration for a world map
export interface WorldMapConfig {
  id: string;
  worldX: number;
  worldY: number;
  width: number;
  height: number;
  tileWidth?: number;
  tileHeight?: number;
}

// World Maps Manager
export class WorldMapsManager {
  getAdjacentMaps(map: WorldMapInfo, coordinates: {x: number, y: number}): WorldMapInfo[];
  getMapInfo(mapId: string): WorldMapInfo | null;
  getAllMaps(): WorldMapInfo[];
}
```

## Implémentation du système

### 1. Extension de RpgMap
- Ajouter `worldX`, `worldY` : coordonnées dans le monde global
- Ajouter `getInWorldMaps()` : retourne le gestionnaire de world maps
- Gérer les maps adjacentes

### 2. Méthode autoChangeMap dans RpgPlayer
- Détection des bords de map basée sur la position du joueur
- Calcul des coordonnées dans la map adjacente
- Protection contre les changements en boucle avec `touchSide`
- Support des 4 directions (haut, bas, gauche, droite)

### 3. Calculs de position
- **Bord gauche** : `x < marginLeftRight && direction == Left`
  - Map adjacente : `{x: map.worldX - 1, y: worldY}`
  - Nouvelle position : `x = nextMap.width - hitbox - margin`
  
- **Bord droit** : `x > map.widthPx - hitbox - margin && direction == Right`
  - Map adjacente : `{x: map.worldX + map.widthPx + 1, y: worldY}`
  - Nouvelle position : `x = margin`

- **Bord haut** : `y < marginTopDown && direction == Up`
  - Map adjacente : `{x: worldX, y: map.worldY - 1}`
  - Nouvelle position : `y = nextMap.height - hitbox - margin`

- **Bord bas** : `y > map.heightPx - hitbox - margin && direction == Down`
  - Map adjacente : `{x: worldX, y: map.worldY + map.heightPx + 1}`
  - Nouvelle position : `y = margin`

## Avantages du système

1. **Changement fluide** : Transition automatique entre maps adjacentes
2. **Calcul intelligent** : Préservation relative de la position du joueur
3. **Protection anti-spam** : Flag `touchSide` pour éviter les changements en boucle
4. **Extensible** : Support facile pour des mondes plus complexes
5. **Compatible** : S'intègre avec le système de maps Tiled existant

## Configuration requise

```typescript
// Exemple de configuration world maps
const worldMaps = [
  {
    id: "town",
    worldX: 0,
    worldY: 0,
    width: 1024,
    height: 768,
    tileWidth: 32,
    tileHeight: 32
  },
  {
    id: "forest", 
    worldX: 1024,
    worldY: 0,
    width: 1024,
    height: 768,
    tileWidth: 32,
    tileHeight: 32
  }
];
```

## Points d'attention

1. **Calcul des marges** : Basé sur la taille des tiles (`tileWidth/2`, `tileHeight/2`)
2. **Gestion des erreurs** : Vérifier l'existence des maps adjacentes
3. **Performance** : Cache des maps adjacentes pour éviter les recalculs
4. **Synchronisation** : Assurer la cohérence entre client et serveur
5. **Debugging** : Logs pour tracer les changements de map

## Prochaines étapes

1. Implémenter `WorldMapsManager` 
2. Étendre `RpgTiledMap` avec les propriétés world
3. Ajouter `autoChangeMap` dans `RpgPlayer`
4. Intégrer avec le système de mouvement existant
5. Tester avec des maps de différentes tailles

---

## 🎯 IMPLEMENTED SOLUTION

### Modified files:

#### 1. `packages/common/src/rooms/WorldMaps.ts` ✅ CREATED
- **WorldMapsManager** : Main world maps manager
- **WorldMapInfo** : Interface for map information  
- **WorldMapConfig** : Configuration for world maps
- Methods to find adjacent maps and calculate positions

#### 2. `packages/common/src/rooms/Map.ts` ✅ MODIFIED
- Added world maps properties to RpgCommonMap
- Added `worldX`, `worldY`, `tileWidth`, `tileHeight`, `worldMapsManager`
- Method `getWorldMapsManager()` to access the manager
- Enhanced `movePlayer()` to support autoChangeMap

#### 3. `packages/common/src/index.ts` ✅ MODIFIED
- Export of new world maps classes and interfaces
- `WorldMapsManager`, `WorldMapInfo`, `WorldMapConfig` available

#### 4. `packages/server/src/Player/Player.ts` ✅ MODIFIED
- Property `touchSide` for anti-spam protection
- Method **`autoChangeMap(nextPosition)`** complete:
  - Detection of 4 map borders (left, right, top, bottom)
  - Calculation of adjacent maps via WorldMapsManager
  - Automatic calculation of new positions
  - Protection against loop changes

#### 5. `packages/server/src/rooms/map.ts` ✅ MODIFIED
- Action `move` made asynchronous to support `autoChangeMap()`

### Implemented features:

✅ **Automatic map change**
- Real-time map border detection
- Smooth transition to adjacent maps
- Intelligent calculation of new positions

✅ **World maps manager**
- Flexible configuration of maps and their relationships
- Spatial index for optimal performance
- Utility methods for navigation

✅ **Anti-spam protection**
- `touchSide` flag with automatic timeout
- Prevents loop changes

✅ **Advanced position calculations**
- Relative preservation of player position
- Margins based on tile size
- Support for player hitboxes

### System usage:

```typescript
import { WorldMapsManager } from "@rpgjs/common";

// 1. Configure the world maps
const worldMaps = new WorldMapsManager();
worldMaps.configure([
  { id: "town", worldX: 0, worldY: 0, width: 1024, height: 768 },
  { id: "forest", worldX: 1024, worldY: 0, width: 1024, height: 768 }
]);

// 2. Attach to a map
mapData.worldMapsManager = worldMaps;
mapData.worldX = 0;
mapData.worldY = 0;
mapData.tileWidth = 32;
mapData.tileHeight = 32;

// 3. The system works automatically!
// When a player touches a border, they automatically change maps
```

### Recommended tests:

1. **Basic test**: Player goes from one map to the adjacent one
2. **4 directions test**: Check all borders
3. **Anti-spam test**: Rapid movement near borders
4. **Position test**: Verify that relative position is preserved
5. **No adjacent map test**: Verify that nothing happens

The system is now **completely implemented** and ready to use! 🚀