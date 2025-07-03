# World Maps Implementation

## Vue d'ensemble

Implémentation d'un système de world maps permettant le changement automatique entre maps adjacentes lorsqu'un joueur touche les bords d'une map.

## Architecture existante analysée

### Structures trouvées :
- **RpgMap** (`packages/server/src/rooms/map.ts`) : Classe principale des maps
- **RpgTiledMap** (`packages/tiledmap/src/server.ts`) : Extension pour maps Tiled
- **RpgPlayer** (`packages/server/src/Player/Player.ts`) : Joueurs avec méthode `changeMap`
- **RpgCommonPhysic** (`packages/common/src/Physic.ts`) : Système de physique et collisions

### Fonctionnalités existantes :
- `player.changeMap(mapId, position)` : Changement de map manuel
- Système de coordonnées x, y pour les joueurs
- Détection des bords de map via hitboxes statiques
- Propriétés `widthPx`, `heightPx` dans les maps Tiled

## Interfaces nécessaires

```typescript
// Interface pour les informations de world map
export interface RpgTiledWorldMap {
  id: string;
  x: number;      // Position X dans le monde
  y: number;      // Position Y dans le monde  
  width: number;  // Largeur en pixels
  height: number; // Hauteur en pixels
  worldX: number; // Coordonnée X mondiale
  worldY: number; // Coordonnée Y mondiale
  widthPx: number;  // Largeur en pixels (alias)
  heightPx: number; // Hauteur en pixels (alias)
  tileWidth: number;  // Largeur d'une tile
  tileHeight: number; // Hauteur d'une tile
}

// Interface pour la gestion des world maps
export interface WorldMapsManager {
  getAdjacentMaps(map: RpgTiledWorldMap, coordinates: {x: number, y: number}): RpgTiledWorldMap[];
  getMapInfo(mapId: string): RpgTiledWorldMap | null;
  getAllMaps(): RpgTiledWorldMap[];
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

## 🎯 IMPLÉMENTATION RÉALISÉE

### Fichiers modifiés :

#### 1. `packages/tiledmap/src/world-maps.ts` ✅ CRÉÉ
- **WorldMapsManager** : Gestionnaire principal des world maps
- **RpgTiledWorldMap** : Interface pour les informations de map
- **WorldMapConfig** : Configuration des world maps
- Méthodes pour trouver maps adjacentes et calculer positions

#### 2. `packages/tiledmap/src/server.ts` ✅ MODIFIÉ
- Extension de l'interface RpgMap avec propriétés world maps
- Ajout de `worldX`, `worldY`, `tileWidth`, `tileHeight`, `worldMapsManager`
- Méthode `getInWorldMaps()` pour accéder au gestionnaire
- Hook `onBeforeUpdate` étendu pour configurer les world maps

#### 3. `packages/tiledmap/src/index.ts` ✅ MODIFIÉ
- Export des nouvelles classes et interfaces world maps
- `WorldMapsManager`, `RpgTiledWorldMap`, `WorldMapConfig` disponibles

#### 4. `packages/server/src/Player/Player.ts` ✅ MODIFIÉ
- Propriété `touchSide` pour protection anti-spam
- Méthode **`autoChangeMap(nextPosition)`** complète :
  - Détection des 4 bords de map (gauche, droite, haut, bas)
  - Calcul des maps adjacentes via WorldMapsManager
  - Calcul automatique des nouvelles positions
  - Protection contre les changements en boucle

#### 5. `packages/common/src/rooms/Map.ts` ✅ MODIFIÉ
- Méthode `movePlayer()` rendue asynchrone
- Appel à `autoChangeMap()` avant le mouvement physique
- Calcul prédictif de la prochaine position

#### 6. `packages/server/src/rooms/map.ts` ✅ MODIFIÉ
- Action `move` rendue asynchrone pour supporter `autoChangeMap()`

### Fonctionnalités implémentées :

✅ **Changement automatique de map**
- Détection des bords de map en temps réel
- Transition fluide vers maps adjacentes
- Calcul intelligent des nouvelles positions

✅ **Gestionnaire de world maps**
- Configuration flexible des maps et leurs relations
- Index spatial pour performance optimale
- Méthodes utilitaires pour navigation

✅ **Protection anti-spam**
- Flag `touchSide` avec timeout automatique
- Prévient les changements en boucle

✅ **Calculs de position avancés**
- Préservation relative de la position du joueur
- Marges basées sur la taille des tiles
- Support des hitboxes de joueur

### Utilisation du système :

```typescript
// 1. Configurer les world maps
const worldMaps = new WorldMapsManager();
worldMaps.configure([
  { id: "town", worldX: 0, worldY: 0, width: 1024, height: 768 },
  { id: "forest", worldX: 1024, worldY: 0, width: 1024, height: 768 }
]);

// 2. Attacher à une map
mapData.worldMapsManager = worldMaps;
mapData.worldX = 0;
mapData.worldY = 0;

// 3. Le système fonctionne automatiquement !
// Quand un joueur touche un bord, il change automatiquement de map
```

### Tests recommandés :

1. **Test de base** : Joueur va d'une map à l'adjacente
2. **Test des 4 directions** : Vérifier tous les bords
3. **Test anti-spam** : Mouvement rapide près des bords
4. **Test de position** : Vérifier que la position relative est préservée
5. **Test sans map adjacente** : Vérifier que rien ne se passe

Le système est maintenant **complètement implémenté** et prêt à être utilisé ! 🚀