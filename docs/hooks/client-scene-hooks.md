# Client Scene Hooks

Scene hooks allow you to customize the behavior of scenes (maps) on the client side. These hooks are defined in the `scenes` property of your client module.

## Usage

```ts
import { RpgSceneMap, RpgSceneMapHooks, defineModule } from '@rpgjs/client'

const sceneMap: RpgSceneMapHooks = {
    onAfterLoading(scene: RpgSceneMap) {
        console.log(`Map ${scene.id} loaded`)
    },
    onAddSprite(scene: RpgSceneMap, sprite: RpgSprite) {
        console.log(`Sprite ${sprite.id} added to scene`)
    }
}

export default defineModule({
    scenes: {
        map: sceneMap
    }
})
```

## Available Hooks

### onBeforeLoading

**Description:** Called before the scene starts loading

**Parameters:**
- `scene: RpgSceneMap` - The scene instance

**Example:**
```ts
const sceneMap: RpgSceneMapHooks = {
    onBeforeLoading(scene: RpgSceneMap) {
        console.log(`🔄 Loading map: ${scene.id}`)
        
        // Show loading screen
        scene.showLoadingScreen({
            message: `Loading ${scene.name}...`,
            showProgress: true
        })
        
        // Initialize scene data
        scene.customData = {
            loadStartTime: Date.now(),
            weather: 'clear',
            timeOfDay: 'day',
            ambientSounds: []
        }
        
        // Preload custom resources
        scene.preloadCustomAssets([
            'custom-particles.json',
            'ambient-sounds.ogg',
            'weather-effects.png'
        ])
        
        // Set up scene-specific configurations
        if (scene.id === 'dungeon-1') {
            scene.enableFogOfWar()
            scene.setAmbientLight(0.3) // Darker lighting
        }
        
        if (scene.id === 'town-square') {
            scene.enableDayNightCycle()
            scene.setWeatherSystem(true)
        }
    }
}
```

### onAfterLoading

**Description:** Called after the scene has finished loading (images loaded, drawing completed, viewport assigned)

**Parameters:**
- `scene: RpgSceneMap` - The scene instance

**Example:**
```ts
const sceneMap: RpgSceneMapHooks = {
    onAfterLoading(scene: RpgSceneMap) {
        console.log(`✅ Map ${scene.id} fully loaded`)
        
        // Hide loading screen
        scene.hideLoadingScreen()
        
        // Calculate loading time
        const loadTime = Date.now() - scene.customData.loadStartTime
        console.log(`Map loaded in ${loadTime}ms`)
        
        // Initialize scene systems
        scene.initializeParticleSystem()
        scene.initializeLightingSystem()
        scene.initializeAudioSystem()
        
        // Set up scene-specific features
        if (scene.id === 'forest-1') {
            scene.addAmbientSound('forest-ambience', { volume: 0.3, loop: true })
            scene.addParticleEffect('falling-leaves', { density: 0.1 })
            scene.setWeather('light-rain', 0.2)
        }
        
        if (scene.id === 'cave-entrance') {
            scene.addAmbientSound('cave-echo', { volume: 0.5, loop: true })
            scene.setAmbientLight(0.6)
            scene.addParticleEffect('dust-motes', { density: 0.05 })
        }
        
        // Show welcome message for special areas
        if (scene.isNewArea) {
            scene.showAreaTitle(scene.name, 3000)
        }
        
        // Initialize minimap
        scene.initializeMinimap()
        
        // Set up camera bounds
        scene.camera.setBounds(0, 0, scene.width, scene.height)
        
        // Trigger scene-specific events
        scene.triggerEvent('onSceneReady')
    }
}
```

### onMapLoading

**Description:** Called while the map and resources are being loaded

**Parameters:**
- `scene: RpgSceneMap` - The scene instance
- `loader: PIXI.Loader` - The PIXI loader instance

**Example:**
```ts
const sceneMap: RpgSceneMapHooks = {
    onMapLoading(scene: RpgSceneMap, loader: any) {
        console.log(`📦 Loading resources for map: ${scene.id}`)
        
        // Add custom resources to loader
        loader.add('custom-tileset', '/assets/custom-tileset.png')
        loader.add('scene-music', `/assets/music/${scene.id}.ogg`)
        loader.add('scene-effects', `/assets/effects/${scene.id}.json`)
        
        // Track loading progress
        loader.onProgress.add((loader: any, resource: any) => {
            const progress = loader.progress
            scene.updateLoadingProgress(progress, `Loading ${resource.name}...`)
            
            console.log(`Loading progress: ${progress}% - ${resource.name}`)
        })
        
        // Handle loading errors
        loader.onError.add((error: any, loader: any, resource: any) => {
            console.error(`Failed to load resource: ${resource.name}`, error)
            scene.showLoadingError(`Failed to load ${resource.name}`)
        })
        
        // Add scene-specific resources based on map type
        if (scene.mapType === 'dungeon') {
            loader.add('torch-flame', '/assets/effects/torch-flame.json')
            loader.add('dungeon-ambience', '/assets/audio/dungeon-ambience.ogg')
        }
        
        if (scene.mapType === 'outdoor') {
            loader.add('wind-particles', '/assets/effects/wind.json')
            loader.add('bird-sounds', '/assets/audio/birds.ogg')
        }
        
        // Load weather effects if needed
        if (scene.hasWeather) {
            loader.add('rain-effect', '/assets/weather/rain.json')
            loader.add('snow-effect', '/assets/weather/snow.json')
            loader.add('fog-effect', '/assets/weather/fog.png')
        }
    }
}
```

### onAddSprite

**Description:** Called when a sprite is added to the scene

**Parameters:**
- `scene: RpgSceneMap` - The scene instance
- `sprite: RpgSprite` - The sprite being added

**Example:**
```ts
const sceneMap: RpgSceneMapHooks = {
    onAddSprite(scene: RpgSceneMap, sprite: RpgSprite) {
        console.log(`➕ Sprite ${sprite.id} added to scene ${scene.id}`)
        
        // Apply scene-specific effects to sprites
        if (scene.id === 'underwater-cave') {
            sprite.addFilter('underwater-distortion')
            sprite.addParticleEffect('bubbles', { rate: 0.1 })
        }
        
        if (scene.id === 'desert-oasis') {
            sprite.addFilter('heat-shimmer')
            if (sprite.type === 'player') {
                sprite.addStatusEffect('heat-exhaustion-risk')
            }
        }
        
        // Add sprite to minimap
        if (scene.minimap && sprite.showOnMinimap) {
            scene.minimap.addSprite(sprite)
        }
        
        // Set up sprite lighting
        if (scene.lightingSystem) {
            if (sprite.type === 'player') {
                sprite.lightSource = scene.lightingSystem.addLight({
                    x: sprite.x,
                    y: sprite.y,
                    radius: 100,
                    intensity: 0.8,
                    color: '#ffffff'
                })
            }
            
            if (sprite.type === 'torch') {
                sprite.lightSource = scene.lightingSystem.addLight({
                    x: sprite.x,
                    y: sprite.y,
                    radius: 80,
                    intensity: 1.0,
                    color: '#ff8800',
                    flicker: true
                })
            }
        }
        
        // Play spawn sound
        if (sprite.spawnSound) {
            scene.playSound(sprite.spawnSound, {
                x: sprite.x,
                y: sprite.y,
                volume: 0.5
            })
        }
        
        // Add to collision system
        if (sprite.hasCollision) {
            scene.collisionSystem.addSprite(sprite)
        }
    }
}
```

### onRemoveSprite

**Description:** Called when a sprite is removed from the scene

**Parameters:**
- `scene: RpgSceneMap` - The scene instance
- `sprite: RpgSprite` - The sprite being removed

**Example:**
```ts
const sceneMap: RpgSceneMapHooks = {
    onRemoveSprite(scene: RpgSceneMap, sprite: RpgSprite) {
        console.log(`➖ Sprite ${sprite.id} removed from scene ${scene.id}`)
        
        // Remove from minimap
        if (scene.minimap) {
            scene.minimap.removeSprite(sprite)
        }
        
        // Remove lighting
        if (sprite.lightSource) {
            scene.lightingSystem.removeLight(sprite.lightSource)
        }
        
        // Remove from collision system
        if (sprite.hasCollision) {
            scene.collisionSystem.removeSprite(sprite)
        }
        
        // Play despawn effects
        if (sprite.type === 'enemy') {
            scene.addParticleEffect('enemy-death', sprite.x, sprite.y)
            scene.playSound('enemy-death', {
                x: sprite.x,
                y: sprite.y,
                volume: 0.7
            })
        }
        
        if (sprite.type === 'item') {
            scene.addParticleEffect('item-pickup', sprite.x, sprite.y)
            scene.playSound('item-pickup', {
                x: sprite.x,
                y: sprite.y,
                volume: 0.5
            })
        }
        
        // Clean up sprite-specific resources
        if (sprite.customResources) {
            sprite.customResources.forEach(resource => {
                scene.unloadResource(resource)
            })
        }
        
        // Update scene statistics
        scene.updateSpriteCount(sprite.type, -1)
    }
}
```

### onChanges

**Description:** Called when server data changes on the map

**Parameters:**
- `scene: RpgSceneMap` - The scene instance
- `obj: { data: any, partial: any }` - Change data

**Example:**
```ts
const sceneMap: RpgSceneMapHooks = {
    onChanges(scene: RpgSceneMap, { data, partial }) {
        console.log(`🔄 Scene ${scene.id} data changed`)
        
        // Handle weather changes
        if (partial.weather) {
            scene.setWeather(partial.weather.type, partial.weather.intensity)
            
            // Adjust ambient sounds based on weather
            if (partial.weather.type === 'rain') {
                scene.addAmbientSound('rain', { volume: partial.weather.intensity })
            } else if (partial.weather.type === 'storm') {
                scene.addAmbientSound('thunder', { volume: 0.8 })
                scene.addLightningEffect()
            }
        }
        
        // Handle time of day changes
        if (partial.timeOfDay) {
            scene.setTimeOfDay(partial.timeOfDay)
            
            // Adjust lighting
            const lightLevel = scene.getLightLevelForTime(partial.timeOfDay)
            scene.setAmbientLight(lightLevel)
            
            // Change ambient sounds
            if (partial.timeOfDay === 'night') {
                scene.addAmbientSound('night-crickets', { volume: 0.4 })
                scene.removeAmbientSound('day-birds')
            } else if (partial.timeOfDay === 'day') {
                scene.addAmbientSound('day-birds', { volume: 0.3 })
                scene.removeAmbientSound('night-crickets')
            }
        }
        
        // Handle map events
        if (partial.events) {
            Object.keys(partial.events).forEach(eventId => {
                const eventData = partial.events[eventId]
                const event = scene.getEvent(eventId)
                
                if (event) {
                    event.updateFromServer(eventData)
                }
            })
        }
        
        // Handle global map states
        if (partial.mapState) {
            if (partial.mapState.isUnderAttack) {
                scene.enableCombatMode()
                scene.playMusic('battle-theme')
            } else {
                scene.disableCombatMode()
                scene.playMusic('ambient-theme')
            }
        }
        
        // Handle player count changes
        if (partial.playerCount !== undefined) {
            scene.updatePlayerCount(partial.playerCount)
            
            // Adjust server performance based on player count
            if (partial.playerCount > 10) {
                scene.enablePerformanceMode()
            } else {
                scene.disablePerformanceMode()
            }
        }
    }
}
```

### onDraw

**Description:** Called when the scene is being drawn (each frame)

**Parameters:**
- `scene: RpgSceneMap` - The scene instance
- `t: number` - Current timestamp

**Example:**
```ts
const sceneMap: RpgSceneMapHooks = {
    onDraw(scene: RpgSceneMap, t: number) {
        // Update custom visual effects
        if (scene.customEffects) {
            scene.customEffects.forEach(effect => {
                effect.update(t)
            })
        }
        
        // Update particle systems
        if (scene.particleSystem) {
            scene.particleSystem.update(t)
        }
        
        // Update lighting system
        if (scene.lightingSystem) {
            scene.lightingSystem.update(t)
        }
        
        // Update weather effects
        if (scene.weatherSystem) {
            scene.weatherSystem.update(t)
        }
        
        // Update day/night cycle
        if (scene.dayNightCycle) {
            scene.dayNightCycle.update(t)
        }
        
        // Update camera effects
        if (scene.camera.shake) {
            scene.camera.updateShake(t)
        }
        
        // Update UI elements
        if (scene.ui) {
            scene.ui.update(t)
        }
        
        // Performance monitoring
        if (t % 1000 < 16) { // Every second (assuming 60 FPS)
            scene.updatePerformanceMetrics()
        }
    }
}
```

## Complete Example

```ts
import { RpgSceneMap, RpgSceneMapHooks, RpgSprite, defineModule } from '@rpgjs/client'

const sceneMap: RpgSceneMapHooks = {
    onBeforeLoading(scene: RpgSceneMap) {
        console.log(`🔄 Preparing to load map: ${scene.id}`)
        
        // Initialize scene systems
        scene.customData = {
            loadStartTime: Date.now(),
            weather: 'clear',
            timeOfDay: 'day',
            playerCount: 0,
            effects: []
        }
        
        // Show loading screen
        scene.showLoadingScreen(`Loading ${scene.name}...`)
        
        // Scene-specific preparations
        if (scene.id.includes('dungeon')) {
            scene.enableFogOfWar()
            scene.setAmbientLight(0.4)
        }
    },
    
    onMapLoading(scene: RpgSceneMap, loader: any) {
        // Add custom resources
        loader.add(`${scene.id}-music`, `/assets/music/${scene.id}.ogg`)
        loader.add(`${scene.id}-effects`, `/assets/effects/${scene.id}.json`)
        
        // Track progress
        loader.onProgress.add((loader: any, resource: any) => {
            scene.updateLoadingProgress(loader.progress, resource.name)
        })
    },
    
    onAfterLoading(scene: RpgSceneMap) {
        console.log(`✅ Map ${scene.id} loaded successfully`)
        
        const loadTime = Date.now() - scene.customData.loadStartTime
        console.log(`Load time: ${loadTime}ms`)
        
        // Hide loading screen
        scene.hideLoadingScreen()
        
        // Initialize scene systems
        scene.initializeParticleSystem()
        scene.initializeLightingSystem()
        scene.initializeWeatherSystem()
        scene.initializeAudioSystem()
        
        // Set up scene-specific features
        this.setupSceneFeatures(scene)
        
        // Show area title
        if (scene.isNewArea) {
            scene.showAreaTitle(scene.name, 3000)
        }
    },
    
    onAddSprite(scene: RpgSceneMap, sprite: RpgSprite) {
        console.log(`➕ Adding sprite ${sprite.id} to ${scene.id}`)
        
        // Apply scene effects
        this.applySceneEffectsToSprite(scene, sprite)
        
        // Add to systems
        if (scene.minimap) scene.minimap.addSprite(sprite)
        if (scene.lightingSystem) this.setupSpriteLighting(scene, sprite)
        if (scene.collisionSystem && sprite.hasCollision) {
            scene.collisionSystem.addSprite(sprite)
        }
        
        // Update counters
        scene.customData.playerCount += sprite.type === 'player' ? 1 : 0
    },
    
    onRemoveSprite(scene: RpgSceneMap, sprite: RpgSprite) {
        console.log(`➖ Removing sprite ${sprite.id} from ${scene.id}`)
        
        // Remove from systems
        if (scene.minimap) scene.minimap.removeSprite(sprite)
        if (sprite.lightSource) scene.lightingSystem.removeLight(sprite.lightSource)
        if (scene.collisionSystem) scene.collisionSystem.removeSprite(sprite)
        
        // Play removal effects
        this.playRemovalEffects(scene, sprite)
        
        // Update counters
        scene.customData.playerCount -= sprite.type === 'player' ? 1 : 0
    },
    
    onChanges(scene: RpgSceneMap, { data, partial }) {
        // Handle weather changes
        if (partial.weather) {
            scene.setWeather(partial.weather.type, partial.weather.intensity)
        }
        
        // Handle time changes
        if (partial.timeOfDay) {
            scene.setTimeOfDay(partial.timeOfDay)
            const lightLevel = this.getLightLevelForTime(partial.timeOfDay)
            scene.setAmbientLight(lightLevel)
        }
        
        // Handle events
        if (partial.events) {
            this.updateSceneEvents(scene, partial.events)
        }
    },
    
    onDraw(scene: RpgSceneMap, t: number) {
        // Update all systems
        scene.particleSystem?.update(t)
        scene.lightingSystem?.update(t)
        scene.weatherSystem?.update(t)
        scene.dayNightCycle?.update(t)
        
        // Update custom effects
        scene.customData.effects.forEach(effect => effect.update(t))
        
        // Performance monitoring
        if (t % 1000 < 16) {
            scene.updatePerformanceMetrics()
        }
    },
    
    // Helper methods
    setupSceneFeatures(scene: RpgSceneMap) {
        switch (scene.id) {
            case 'forest-clearing':
                scene.addAmbientSound('forest-birds', { volume: 0.3 })
                scene.addParticleEffect('falling-leaves')
                break
                
            case 'dark-cave':
                scene.addAmbientSound('cave-drips', { volume: 0.4 })
                scene.setAmbientLight(0.2)
                break
                
            case 'town-square':
                scene.addAmbientSound('town-chatter', { volume: 0.2 })
                scene.enableDayNightCycle()
                break
        }
    },
    
    applySceneEffectsToSprite(scene: RpgSceneMap, sprite: RpgSprite) {
        if (scene.id === 'underwater-level') {
            sprite.addFilter('underwater-distortion')
            sprite.addParticleEffect('bubbles')
        }
        
        if (scene.id === 'desert-area') {
            sprite.addFilter('heat-shimmer')
        }
    },
    
    setupSpriteLighting(scene: RpgSceneMap, sprite: RpgSprite) {
        if (sprite.type === 'player') {
            sprite.lightSource = scene.lightingSystem.addLight({
                x: sprite.x,
                y: sprite.y,
                radius: 100,
                intensity: 0.8,
                color: '#ffffff'
            })
        }
    },
    
    playRemovalEffects(scene: RpgSceneMap, sprite: RpgSprite) {
        if (sprite.type === 'enemy') {
            scene.addParticleEffect('enemy-death', sprite.x, sprite.y)
            scene.playSound('enemy-death', { x: sprite.x, y: sprite.y })
        }
    },
    
    getLightLevelForTime(timeOfDay: string): number {
        switch (timeOfDay) {
            case 'dawn': return 0.6
            case 'day': return 1.0
            case 'dusk': return 0.7
            case 'night': return 0.3
            default: return 1.0
        }
    },
    
    updateSceneEvents(scene: RpgSceneMap, events: any) {
        Object.keys(events).forEach(eventId => {
            const event = scene.getEvent(eventId)
            if (event) {
                event.updateFromServer(events[eventId])
            }
        })
    }
}

export default defineModule({
    scenes: {
        map: sceneMap
    }
}) 