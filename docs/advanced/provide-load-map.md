# provideLoadMap

The `provideLoadMap` function allows you to customize how maps are loaded and displayed on the client side. It enables you to provide a custom map component and define how map data is processed before rendering.

## Overview

`provideLoadMap` is a client-side function that takes a callback function which receives a map ID and returns map data along with a custom component for rendering. This is particularly useful when you want to:

- Use custom map formats (like Tiled TMX files)
- Display maps with custom rendering components
- Process map data before rendering
- Add custom layers or effects to your maps

## Basic Usage

```ts
import { provideLoadMap } from '@rpgjs/client'
import { createModule } from '@rpgjs/common'
import MyMapComponent from './MyMapComponent.ce'

export function provideCustomMap() {
  return createModule("CustomMap", [
    provideLoadMap(async (mapId) => {
      // Load your map data
      const response = await fetch(`/maps/${mapId}.json`)
      const mapData = await response.json()
      
      return {
        data: mapData,           // Raw map data
        component: MyMapComponent, // CanvasEngine component
        width: mapData.width,    // Map width in pixels
        height: mapData.height,  // Map height in pixels
        events: mapData.events   // Optional: map events
      }
    })
  ])
}
```

## Return Object Properties

The callback function must return an object with the following properties:

### Required Properties

- **`data`** - The raw map data that will be passed to your component
- **`component`** - A CanvasEngine component that will render the map

### Optional Properties

- **`width`** - Map width in pixels (used for viewport calculations)
- **`height`** - Map height in pixels (used for viewport calculations)  
- **`events`** - Map events data
- **`id`** - Map identifier (defaults to the mapId parameter)

## Creating a Map Component

Your map component should be a CanvasEngine component that receives the map data through props:

```ts
// MyMapComponent.ce
<Container>
    <TileMap tiles={mapTiles} />
    <EventLayerComponent />
</Container>

<script>
    import { EventLayerComponent } from "@rpgjs/client"
    import { signal } from "canvasengine"

    // Get the map data from props
    const { data } = defineProps()
    
    // Access the data using data()
    const mapData = data()
    const mapTiles = signal(mapData.tiles)
</script>
```

### Accessing Props Data

In your component, use `defineProps()` to access the map data:

```ts
const { data } = defineProps()

// The data is a signal, call it to get the actual value
const mapData = data()
```

## Event Layer Integration

To display game events (NPCs, interactive objects, etc.), include the `EventLayerComponent` in your map component:

```ts
<Container>
    <!-- Your map rendering -->
    <MyTileRenderer tiles={tiles} />
    
    <!-- Event layer for NPCs, players, interactive objects -->
    <EventLayerComponent />
</Container>

<script>
    import { EventLayerComponent } from "@rpgjs/client"
    
    const { data } = defineProps()
    const mapData = data()
    const tiles = signal(mapData.layers)
</script>
```

The `EventLayerComponent` automatically handles:
- Player character rendering
- NPC and event rendering  
- Character animations and interactions
- Proper layering and sorting
