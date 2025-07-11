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
- **`hitboxes`** - Array of collision hitboxes for the map

## Creating a Map Component

Your map component should be a CanvasEngine component that receives the map data through props:

```html
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

```html
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

### Adding Custom Elements to EventLayerComponent

You can add custom elements inside `EventLayerComponent` that will be automatically sorted by zIndex with the rest of the elements:

```html
<Container>
    <MyTileRenderer tiles={tiles} />
    
    <EventLayerComponent>
        <!-- Custom elements will be auto-sorted by zIndex -->
        <Text text="Hello World" x={100} y={100} zIndex={5} />
        <Sprite image="custom-effect.png" x={200} y={150} zIndex={10} />
        <Container x={300} y={200} zIndex={1}>
            <Circle radius={20} color="red" />
        </Container>
    </EventLayerComponent>
</Container>

<script>
    import { EventLayerComponent } from "@rpgjs/client"
    import { Text, Sprite, Circle } from "canvasengine"
    
    const { data } = defineProps()
    const mapData = data()
    const tiles = signal(mapData.layers)
</script>
```

## Hitboxes Configuration

The `hitboxes` property allows you to define collision areas for the map. Each hitbox can be either rectangular or polygonal:

### Rectangular Hitboxes

```ts
return {
  data: mapData,
  component: MyMapComponent,
  width: 2048,
  height: 1536,
  hitboxes: [
    {
      id: "wall1",           // Optional: unique identifier
      x: 100,                // X position in pixels
      y: 50,                 // Y position in pixels
      width: 32,             // Width in pixels
      height: 128            // Height in pixels
    },
    {
      id: "obstacle1",
      x: 300,
      y: 200,
      width: 64,
      height: 64
    }
  ]
}
```

### Polygonal Hitboxes

```ts
return {
  data: mapData,
  component: MyMapComponent,
  width: 2048,
  height: 1536,
  hitboxes: [
    {
      id: "triangle1",       // Optional: unique identifier
      points: [              // Array of [x, y] coordinates
        [100, 100],
        [150, 50],
        [200, 100]
      ]
    },
    {
      id: "complex-shape",
      points: [
        [400, 300],
        [450, 250],
        [500, 300],
        [450, 350]
      ]
    }
  ]
}
```

### Mixed Hitboxes

You can combine both rectangular and polygonal hitboxes in the same array:

```ts
return {
  data: mapData,
  component: MyMapComponent,
  width: 2048,
  height: 1536,
  hitboxes: [
    // Rectangular hitbox
    {
      id: "wall1",
      x: 100,
      y: 50,
      width: 32,
      height: 128
    },
    // Polygonal hitbox
    {
      id: "triangle1",
      points: [
        [100, 100],
        [150, 50],
        [200, 100]
      ]
    }
  ]
}
```

**Note:** If no `id` is provided, a unique identifier will be automatically generated for each hitbox.
