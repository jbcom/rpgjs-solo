---
title: "Components"
description: "Component-based UI layout helpers and component utilities for players."
---

# Components

Component-based UI layout helpers and component utilities for players.

## Members

- [align](#align)
- [bar](#bar)
- [bgColor](#bgcolor)
- [borderColor](#bordercolor)
- [borderRadius](#borderradius)
- [borderWidth](#borderwidth)
- [fill](#fill)
- [fill](#fill)
- [fillColor](#fillcolor)
- [fontFamily](#fontfamily)
- [fontSize](#fontsize)
- [fontStyle](#fontstyle)
- [fontWeight](#fontweight)
- [height](#height)
- [height](#height)
- [height](#height)
- [hpBar](#hpbar)
- [image](#image)
- [line](#line)
- [marginBottom](#marginbottom)
- [marginLeft](#marginleft)
- [marginRight](#marginright)
- [marginTop](#margintop)
- [mergeComponents](#mergecomponents)
- [mergeComponents](#mergecomponents)
- [opacity](#opacity)
- [opacity](#opacity)
- [opacity](#opacity)
- [points](#points)
- [radius](#radius)
- [removeComponents](#removecomponents)
- [removeComponents](#removecomponents)
- [setComponentsBottom](#setcomponentsbottom)
- [setComponentsBottom](#setcomponentsbottom)
- [setComponentsCenter](#setcomponentscenter)
- [setComponentsCenter](#setcomponentscenter)
- [setComponentsLeft](#setcomponentsleft)
- [setComponentsLeft](#setcomponentsleft)
- [setComponentsRight](#setcomponentsright)
- [setComponentsRight](#setcomponentsright)
- [setComponentsTop](#setcomponentstop)
- [setComponentsTop](#setcomponentstop)
- [setGraphic](#setgraphic)
- [shape](#shape)
- [spBar](#spbar)
- [stroke](#stroke)
- [text](#text)
- [tile](#tile)
- [type](#type)
- [width](#width)
- [width](#width)
- [width](#width)
- [wordWrap](#wordwrap)
- [x1](#x1)
- [x2](#x2)
- [y1](#y1)
- [y2](#y2)

## align

Text alignment

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `TextComponentOptions`

### Signature

```ts
align: 'left' | 'center' | 'right' | 'justify'
```

## bar

Create a custom bar component

Creates a bar that displays a custom property value relative to a maximum.
Useful for displaying custom resources like wood, mana, energy, etc.

- Source: `packages/server/src/Player/Components.ts`
- Kind: `method`

### Signature

```ts
bar(current: string, max: string, style?: BarComponentOptions, text?: string | null): ComponentDefinition
```

### Parameters

- `current`: `string`
- `max`: `string`
- `style?`: `BarComponentOptions`
- `text?`: `string | null`

### Returns

Component definition for custom bar

### Examples

```ts
// Bar for custom property
Components.bar('wood', 'param.maxWood');

// Bar with text
Components.bar('mana', 'param.maxMana', {}, 'Mana: {$current}/{$max}');
```

## bgColor

Background color in hexadecimal format

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `BarComponentOptions`

### Signature

```ts
bgColor: string
```

## borderColor

Border color in hexadecimal format

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `BarComponentOptions`

### Signature

```ts
borderColor: string
```

## borderRadius

Border radius

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `BarComponentOptions`

### Signature

```ts
borderRadius: number
```

## borderWidth

Border width

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `BarComponentOptions`

### Signature

```ts
borderWidth: number
```

## fill

Text color in hexadecimal format (e.g., '#000000')

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `TextComponentOptions`

### Signature

```ts
fill: string
```

## fill

Fill color in hexadecimal format

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `ShapeComponentOptions`

### Signature

```ts
fill: string
```

## fillColor

Fill color in hexadecimal format

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `BarComponentOptions`

### Signature

```ts
fillColor: string
```

## fontFamily

Font family

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `TextComponentOptions`

### Signature

```ts
fontFamily: string
```

## fontSize

Font size in pixels

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `TextComponentOptions`

### Signature

```ts
fontSize: number
```

## fontStyle

Font style: 'normal', 'italic', 'oblique'

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `TextComponentOptions`

### Signature

```ts
fontStyle: 'normal' | 'italic' | 'oblique'
```

## fontWeight

Font weight: 'normal', 'bold', 'bolder', 'lighter', or numeric values

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `TextComponentOptions`

### Signature

```ts
fontWeight: 'normal' | 'bold' | 'bolder' | 'lighter' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900' | number
```

## height

Height of the component block in pixels

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `ComponentLayout`

### Signature

```ts
height: number
```

## height

Height of the bar in pixels

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `BarComponentOptions`

### Signature

```ts
height: number
```

## height

Height (for rectangle, ellipse)

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `ShapeComponentOptions`

### Signature

```ts
height: number | string
```

## hpBar

Create an HP bar component

Creates a health point bar that automatically displays the player's
current HP relative to their maximum HP. The bar updates automatically
as HP changes.

## Design

HP bars read from the player's hp and param.maxHp properties. The
bar can optionally display text above it showing current, max, or
percentage values.

- Source: `packages/server/src/Player/Components.ts`
- Kind: `method`

### Signature

```ts
hpBar(style?: BarComponentOptions, text?: string | null): ComponentDefinition
```

### Parameters

- `style?`: `BarComponentOptions`
- `text?`: `string | null`

### Returns

Component definition for HP bar

### Examples

```ts
// Simple HP bar
Components.hpBar();

// HP bar with percentage text
Components.hpBar({}, '{$percent}%');

// HP bar with custom styling
Components.hpBar({
  fillColor: '#ff0000',
  height: 8
});
```

## image

Create an image component

Displays an image from a URL or spritesheet identifier.

- Source: `packages/server/src/Player/Components.ts`
- Kind: `method`

### Signature

```ts
image(value: string): ComponentDefinition
```

### Parameters

- `value`: `string`

### Returns

Component definition for image

### Examples

```ts
Components.image('mygraphic.png');
```

## line

Line/border style

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `ShapeComponentOptions`

### Signature

```ts
line: {
    color?: string;
    width?: number;
    alpha?: number;
  }
```

## marginBottom

Margin from the bottom of the player in pixels

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `ComponentLayout`

### Signature

```ts
marginBottom: number
```

## marginLeft

Margin from the left of the player in pixels

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `ComponentLayout`

### Signature

```ts
marginLeft: number
```

## marginRight

Margin from the right of the player in pixels

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `ComponentLayout`

### Signature

```ts
marginRight: number
```

## marginTop

Margin from the top of the player in pixels

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `ComponentLayout`

### Signature

```ts
marginTop: number
```

## mergeComponents

Merge components with existing components at a specific position

Merges new components with existing components at the specified position.

- Source: `packages/server/src/Player/ComponentManager.ts`
- Kind: `method`

### Signature

```ts
mergeComponents(position: ComponentPosition, layout: ComponentInput, options?: ComponentLayout): void
```

### Parameters

- `position`: `ComponentPosition`
- `layout`: `ComponentInput`
- `options?`: `ComponentLayout`

### Returns

void

### Examples

```ts
// First set some components
player.setComponentsTop([Components.text('{name}')]);

// Then merge additional components
player.mergeComponents('top', [Components.hpBar()], {
  width: 100
});
```

## mergeComponents

Merge components with existing components at a specific position

- Source: `packages/server/src/Player/ComponentManager.ts`
- Kind: `method`
- Defined in: `IComponentManager`

### Signature

```ts
mergeComponents(position: ComponentPosition, layout: ComponentInput, options?: ComponentLayout): void
```

### Parameters

- `position`: `ComponentPosition`
- `layout`: `ComponentInput`
- `options?`: `ComponentLayout`

### Returns

void

## opacity

Opacity between 0 and 1

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `TextComponentOptions`

### Signature

```ts
opacity: number
```

## opacity

Opacity between 0 and 1

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `BarComponentOptions`

### Signature

```ts
opacity: number
```

## opacity

Opacity between 0 and 1

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `ShapeComponentOptions`

### Signature

```ts
opacity: number | string
```

## points

Points array (for polygon)

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `ShapeComponentOptions`

### Signature

```ts
points: number[]
```

## radius

Radius (for circle)

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `ShapeComponentOptions`

### Signature

```ts
radius: number | string
```

## removeComponents

Remove components from a specific position

Deletes all components at the specified position.

- Source: `packages/server/src/Player/ComponentManager.ts`
- Kind: `method`

### Signature

```ts
removeComponents(position: ComponentPosition): void
```

### Parameters

- `position`: `ComponentPosition`

### Returns

void

### Examples

```ts
player.removeComponents('top');
```

## removeComponents

Remove components from a specific position

- Source: `packages/server/src/Player/ComponentManager.ts`
- Kind: `method`
- Defined in: `IComponentManager`

### Signature

```ts
removeComponents(position: ComponentPosition): void
```

### Parameters

- `position`: `ComponentPosition`

### Returns

void

## setComponentsBottom

Set components to display below the player graphic

Components are displayed below the player's sprite and can include
text, bars, shapes, or any combination. The components are synchronized
to all clients on the map.

- Source: `packages/server/src/Player/ComponentManager.ts`
- Kind: `method`

### Signature

```ts
setComponentsBottom(layout: ComponentInput, options?: ComponentLayout): void
```

### Parameters

- `layout`: `ComponentInput`
- `options?`: `ComponentLayout`

### Returns

void

### Examples

```ts
player.setComponentsBottom(Components.shape({
  fill: '#ff0000',
  type: 'rectangle',
  width: 32,
  height: 32
}), {
  marginBottom: 16
});
```

## setComponentsBottom

Set components to display below the player graphic

- Source: `packages/server/src/Player/ComponentManager.ts`
- Kind: `method`
- Defined in: `IComponentManager`

### Signature

```ts
setComponentsBottom(layout: ComponentInput, options?: ComponentLayout): void
```

### Parameters

- `layout`: `ComponentInput`
- `options?`: `ComponentLayout`

### Returns

void

## setComponentsCenter

Set components to display at the center of the player graphic

Components are displayed at the center of the player's sprite.
Be careful: if you assign, it deletes the graphics and if the lines are superimposed.

- Source: `packages/server/src/Player/ComponentManager.ts`
- Kind: `method`

### Signature

```ts
setComponentsCenter(layout: ComponentInput, options?: ComponentLayout): void
```

### Parameters

- `layout`: `ComponentInput`
- `options?`: `ComponentLayout`

### Returns

void

### Examples

```ts
player.setComponentsCenter([
  Components.text('{name}'),
  Components.hpBar()
]);
```

## setComponentsCenter

Set components to display at the center of the player graphic

- Source: `packages/server/src/Player/ComponentManager.ts`
- Kind: `method`
- Defined in: `IComponentManager`

### Signature

```ts
setComponentsCenter(layout: ComponentInput, options?: ComponentLayout): void
```

### Parameters

- `layout`: `ComponentInput`
- `options?`: `ComponentLayout`

### Returns

void

## setComponentsLeft

Set components to display to the left of the player graphic

Components are displayed to the left of the player's sprite.

- Source: `packages/server/src/Player/ComponentManager.ts`
- Kind: `method`

### Signature

```ts
setComponentsLeft(layout: ComponentInput, options?: ComponentLayout): void
```

### Parameters

- `layout`: `ComponentInput`
- `options?`: `ComponentLayout`

### Returns

void

### Examples

```ts
player.setComponentsLeft([
  Components.text('{name}'),
  Components.hpBar()
]);
```

## setComponentsLeft

Set components to display to the left of the player graphic

- Source: `packages/server/src/Player/ComponentManager.ts`
- Kind: `method`
- Defined in: `IComponentManager`

### Signature

```ts
setComponentsLeft(layout: ComponentInput, options?: ComponentLayout): void
```

### Parameters

- `layout`: `ComponentInput`
- `options?`: `ComponentLayout`

### Returns

void

## setComponentsRight

Set components to display to the right of the player graphic

Components are displayed to the right of the player's sprite.

- Source: `packages/server/src/Player/ComponentManager.ts`
- Kind: `method`

### Signature

```ts
setComponentsRight(layout: ComponentInput, options?: ComponentLayout): void
```

### Parameters

- `layout`: `ComponentInput`
- `options?`: `ComponentLayout`

### Returns

void

### Examples

```ts
player.setComponentsRight([
  Components.text('{name}'),
  Components.hpBar()
]);
```

## setComponentsRight

Set components to display to the right of the player graphic

- Source: `packages/server/src/Player/ComponentManager.ts`
- Kind: `method`
- Defined in: `IComponentManager`

### Signature

```ts
setComponentsRight(layout: ComponentInput, options?: ComponentLayout): void
```

### Parameters

- `layout`: `ComponentInput`
- `options?`: `ComponentLayout`

### Returns

void

## setComponentsTop

Set components to display above the player graphic

Components are displayed above the player's sprite and can include
text, bars, shapes, or any combination. The components are synchronized
to all clients on the map.

- Source: `packages/server/src/Player/ComponentManager.ts`
- Kind: `method`

### Signature

```ts
setComponentsTop(layout: ComponentInput, options?: ComponentLayout): void
```

### Parameters

- `layout`: `ComponentInput`
- `options?`: `ComponentLayout`

### Returns

void

### Examples

```ts
// Single text component
player.setComponentsTop(Components.text('{name}'));

// Multiple components vertically
player.setComponentsTop([
  Components.text('HP: {hp}'),
  Components.text('{name}')
]);

// Table layout (columns)
player.setComponentsTop([
  [Components.text('{hp}'), Components.text('{name}')]
]);

// With layout options
player.setComponentsTop([
  Components.text('HP: {hp}'),
  Components.text('{name}')
], {
  width: 100,
  height: 30,
  marginBottom: -10
});
```

## setComponentsTop

Set components to display above the player graphic

- Source: `packages/server/src/Player/ComponentManager.ts`
- Kind: `method`
- Defined in: `IComponentManager`

### Signature

```ts
setComponentsTop(layout: ComponentInput, options?: ComponentLayout): void
```

### Parameters

- `layout`: `ComponentInput`
- `options?`: `ComponentLayout`

### Returns

void

## setGraphic

Set the graphic(s) for this player

Allows setting either a single graphic or multiple graphics for the player.
When multiple graphics are provided, they are used for animation sequences.
The graphics system provides flexible visual representation that can be
dynamically changed during gameplay for different states, equipment, or animations.

- Source: `packages/server/src/Player/ComponentManager.ts`
- Kind: `method`
- Defined in: `IComponentManager`

### Signature

```ts
setGraphic(graphic: string | string[]): void
```

### Parameters

- `graphic`: `string | string[]`

### Returns

void

### Examples

```ts
// Set a single graphic for static representation
player.setGraphic("hero");

// Set multiple graphics for animation sequences
player.setGraphic(["hero_idle", "hero_walk", "hero_run"]);

// Dynamic graphic changes based on equipment
if (player.hasArmor('platemail')) {
  player.setGraphic("hero_armored");
}

// Animation sequences for different actions
player.setGraphic(["mage_cast_1", "mage_cast_2", "mage_cast_3"]);
```

## shape

Create a shape component

Creates a geometric shape that can be displayed above or below the player.
Useful for visual indicators, backgrounds, or decorative elements.

- Source: `packages/server/src/Player/Components.ts`
- Kind: `method`

### Signature

```ts
shape(value: ShapeComponentOptions): ComponentDefinition
```

### Parameters

- `value`: `ShapeComponentOptions`

### Returns

Component definition for shape

### Examples

```ts
// Circle shape
Components.shape({
  fill: '#ffffff',
  type: 'circle',
  radius: 10
});

// Rectangle shape
Components.shape({
  fill: '#ff0000',
  type: 'rectangle',
  width: 32,
  height: 32
});

// Using parameters
Components.shape({
  fill: '#ffffff',
  type: 'circle',
  radius: 'hp' // radius will be the same as hp value
});
```

## spBar

Create an SP bar component

Creates a skill point bar that automatically displays the player's
current SP relative to their maximum SP. The bar updates automatically
as SP changes.

- Source: `packages/server/src/Player/Components.ts`
- Kind: `method`

### Signature

```ts
spBar(style?: BarComponentOptions, text?: string | null): ComponentDefinition
```

### Parameters

- `style?`: `BarComponentOptions`
- `text?`: `string | null`

### Returns

Component definition for SP bar

### Examples

```ts
// Simple SP bar
Components.spBar();

// SP bar with text
Components.spBar({}, 'SP: {$current}/{$max}');
```

## stroke

Stroke color in hexadecimal format

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `TextComponentOptions`

### Signature

```ts
stroke: string
```

## text

Create a text component

Creates a text component that displays text with optional styling.
Supports template strings with placeholders like {name}, {hp}, etc.
that are replaced with actual player property values.

## Design

Text components use template strings to allow dynamic content without
resending the entire component structure when values change. Only the
property values are synchronized, reducing bandwidth usage.

- Source: `packages/server/src/Player/Components.ts`
- Kind: `method`

### Signature

```ts
text(value: string, style?: TextComponentOptions): ComponentDefinition
```

### Parameters

- `value`: `string`
- `style?`: `TextComponentOptions`

### Returns

Component definition for text

### Examples

```ts
// Simple text
Components.text('Player Name');

// Text with placeholder
Components.text('{name}');

// Text with styling
Components.text('{name}', {
  fill: '#000000',
  fontSize: 20
});
```

## tile

Create a tile component

Displays a tile from a tileset by ID.

- Source: `packages/server/src/Player/Components.ts`
- Kind: `method`

### Signature

```ts
tile(value: number | string): ComponentDefinition
```

### Parameters

- `value`: `number | string`

### Returns

Component definition for tile

### Examples

```ts
Components.tile(3); // Use tile #3
```

## type

Type of shape

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `ShapeComponentOptions`

### Signature

```ts
type: 'circle' | 'rectangle' | 'ellipse' | 'polygon' | 'line' | 'rounded-rectangle'
```

## width

Width of the component block in pixels

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `ComponentLayout`

### Signature

```ts
width: number
```

## width

Width of the bar in pixels

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `BarComponentOptions`

### Signature

```ts
width: number
```

## width

Width (for rectangle, ellipse)

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `ShapeComponentOptions`

### Signature

```ts
width: number | string
```

## wordWrap

Word wrap

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `TextComponentOptions`

### Signature

```ts
wordWrap: boolean
```

## x1

X1 position (for line)

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `ShapeComponentOptions`

### Signature

```ts
x1: number | string
```

## x2

X2 position (for line)

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `ShapeComponentOptions`

### Signature

```ts
x2: number | string
```

## y1

Y1 position (for line)

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `ShapeComponentOptions`

### Signature

```ts
y1: number | string
```

## y2

Y2 position (for line)

- Source: `packages/server/src/Player/Components.ts`
- Kind: `property`
- Defined in: `ShapeComponentOptions`

### Signature

```ts
y2: number | string
```
