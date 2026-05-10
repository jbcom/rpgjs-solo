---
title: "Attach GUI to Sprites Guide"
description: "Guide for Attach GUI to Sprites Guide in RPGJS."
---

# Attach GUI to Sprites Guide

This guide explains how to use the `attachToSprite` option to attach GUI components directly to sprites in the game world.

<Info>
Use attached GUI when an interface should follow a sprite and still use GUI
lifecycle and interaction APIs. For passive sprite visuals, use
[Sprite Components](/guide/sprite-components) or
[Authoritative Sprite Components](/guide/component).
</Info>

## Overview

By default, GUI components are displayed as fixed overlays on the screen. However, you can attach GUI components to sprites so they follow the sprite's position in the game world. This is useful for:

- Tooltips that appear when hovering over a sprite
- Name tags above characters
- Interactive UI elements attached to specific sprites
- Contextual menus that follow a sprite
- Status indicators that move with the sprite

Attached GUI differs from sprite components because it is opened, hidden, and
driven through the GUI system. Sprite components are better for passive visual
layers such as shadows, halos, labels, and bars.

## Basic Usage

To attach a GUI component to sprites, set `attachToSprite: true` in your GUI configuration:

```typescript
import { defineModule, RpgClient } from '@rpgjs/client'
import TooltipComponent from './components/tooltip.ce'

defineModule<RpgClient>({
    gui: [
        {
            id: "my-tooltip",
            component: TooltipComponent,
            attachToSprite: true
        }
    ]
})
```

## Creating an Attached GUI Component

Attached GUI components are Canvas Engine components (`.ce` files) that receive the sprite object as a prop. They are rendered within the sprite's container, so they automatically follow the sprite's position.

### Example: Simple Tooltip Component

```javascript
<!-- tooltip.ce -->
<DOMContainer>
    <input type="text" placeholder="Enter text..." />
</DOMContainer>
```

The component receives the sprite `object` as a prop automatically, allowing you to access sprite properties:

```javascript
<!-- tooltip.ce -->
<DOMContainer>
    <div style="background: rgba(0,0,0,0.8); color: white; padding: 8px; border-radius: 4px;">
        <p>Player: {object.name()}</p>
        <p>HP: {object.hp()} / {object.param.maxHp()}</p>
    </div>
</DOMContainer>

<script>
  const { object } = defineProps();
</script>
```

> For more information about DOMContainer, see the [Canvas Engine documentation](https://canvasengine.net/components/dom-container.html)

## Controlling Display from Server Side

Attached GUIs are controlled from the server side using the `showAttachedGui()` and `hideAttachedGui()` methods on the player object.

### Show Attached GUI

Display the attached GUI for a player:

```typescript
// Show the attached GUI for this player
player.showAttachedGui()

// Show the attached GUI for other players
player.showAttachedGui([otherPlayer1, otherPlayer2])

// Show for multiple players
player.showAttachedGui([player1, player2, player3])
```

### Hide Attached GUI

Hide the attached GUI for a player:

```typescript
// Hide the attached GUI for this player
player.hideAttachedGui()

// Hide the attached GUI for other players
player.hideAttachedGui([otherPlayer1, otherPlayer2])
```

### Example: Show Tooltip on Hover

```typescript
// server.ts
import { RpgPlayer, RpgMap } from '@rpgjs/server'

export default {
    player: {
        onJoinMap(player: RpgPlayer, map: RpgMap) {
            // Show tooltip when player joins the map
            player.gui('my-tooltip').open()
            player.showAttachedGui()
        },
        
        onLeaveMap(player: RpgPlayer, map: RpgMap) {
            // Hide tooltip when player leaves
            player.hideAttachedGui()
        }
    }
}
```

## Component Props

Attached GUI components receive the following props:

- `object`: The sprite object (RpgClientObject) - contains all sprite properties like position, health, name, etc.
- `onFinish`: Callback function when the GUI finishes its action
- `onInteraction`: Callback function for GUI interactions

### Example: Using Component Props

```javascript
<!-- interactive-tooltip.ce -->
<DOMContainer>
    <div style="background: rgba(0,0,0,0.9); color: white; padding: 10px; border-radius: 4px;">
        <button click={() => onInteraction('action', { type: 'heal' })}>
            Heal
        </button>
        <button click={() => onFinish({ result: 'closed' })}>
            Close
        </button>
    </div>
</DOMContainer>

<script>
  const { object, onFinish, onInteraction } = defineProps();
</script>
```

### Example: Using Reactive Signals with Form Elements

DOMContainer supports reactive two-way data binding for form elements using signals:

```javascript
<!-- tooltip-with-input.ce -->
<script>
  import { signal } from 'canvasengine'
  
  const { object } = defineProps();
  const inputValue = signal('')
</script>

<DOMContainer>
    <div style="background: rgba(0,0,0,0.8); color: white; padding: 8px; border-radius: 4px;">
        <p>Player: {object.name()}</p>
        <input 
            type="text" 
            placeholder="Enter message..." 
            value={inputValue}
        />
        <p>You typed: {inputValue()}</p>
    </div>
</DOMContainer>
```

### Example: Using Event Handlers

DOMContainer supports all standard DOM events. Use the event name directly (without "on" prefix):

```javascript
<!-- interactive-tooltip.ce -->
<script>
  const { object, onFinish, onInteraction } = defineProps();
  
  const handleMouseOver = (event) => {
    console.log('Mouse over tooltip', event)
  }
  
  const handleMouseOut = (event) => {
    console.log('Mouse out of tooltip', event)
  }
</script>

<DOMContainer>
    <div 
        style="background: rgba(0,0,0,0.8); color: white; padding: 8px; border-radius: 4px;"
        mouseover={handleMouseOver}
        mouseout={handleMouseOut}
    >
        <p>Player: {object.name()}</p>
        <button click={() => onInteraction('action', { type: 'heal' })}>
            Heal
        </button>
    </div>
</DOMContainer>
```

### Example: Using CSS Classes

You can apply CSS classes using different formats:

```javascript
<!-- styled-tooltip.ce -->
<script>
  import { signal } from 'canvasengine'
  
  const { object } = defineProps();
  const isActive = signal(false)
</script>

<DOMContainer>
    <!-- String format -->
    <div class="tooltip primary-theme">
        <p>Player: {object.name()}</p>
    </div>
    
    <!-- Array format -->
    <div class={['tooltip', 'primary-theme', 'active']}>
        <p>Player: {object.name()}</p>
    </div>
    
    <!-- Object format (conditional classes) -->
    <div class={{
        'tooltip': true,
        'active': isActive(),
        'inactive': !isActive()
    }}>
        <p>Player: {object.name()}</p>
    </div>
</DOMContainer>
```

### Example: Using Inline Styles

You can apply styles using string or object format:

```javascript
<!-- styled-tooltip.ce -->
<DOMContainer>
    <!-- String format -->
    <div style="background-color: rgba(0,0,0,0.8); color: white; padding: 8px;">
        <p>Player: {object.name()}</p>
    </div>
    
    <!-- Object format -->
    <div style={{
        backgroundColor: 'rgba(0,0,0,0.8)',
        color: 'white',
        padding: '8px',
        borderRadius: '4px',
        fontSize: '14px'
    }}>
        <p>Player: {object.name()}</p>
    </div>
</DOMContainer>

<script>
  const { object } = defineProps();
</script>
```

### Example: Using Forms with Automatic Data Collection

DOMContainer automatically collects form data when a form is submitted:

```javascript
<!-- form-tooltip.ce -->
<script>
  import { signal } from 'canvasengine'
  
  const { object, onInteraction } = defineProps();
  
  const handleSubmit = (event, formData) => {
    console.log('Form submitted with data:', formData)
    // Example formData: { message: 'Hello', priority: 'high' }
    onInteraction('form-submit', formData)
  }
</script>

<DOMContainer>
    <div style="background: rgba(0,0,0,0.8); color: white; padding: 10px; border-radius: 4px;">
        <p>Player: {object.name()}</p>
        <form submit={handleSubmit}>
            <input name="message" type="text" placeholder="Enter message..." />
            <select name="priority">
                <option value="low">Low</option>
                <option value="high">High</option>
            </select>
            <button type="submit">Send</button>
        </form>
    </div>
</DOMContainer>
```

## Supported Events

DOMContainer supports all standard DOM events. Use the event name directly (without "on" prefix):

- **Mouse events**: `click`, `mouseover`, `mouseout`, `mouseenter`, `mouseleave`, `mousemove`, `mouseup`, `mousedown`
- **Touch events**: `touchstart`, `touchend`, `touchmove`, `touchcancel`
- **Keyboard events**: `keydown`, `keyup`, `keypress`
- **Form events**: `submit`, `reset`, `change`, `input`, `focus`, `blur`
- **Drag events**: `drag`, `dragend`, `dragenter`, `dragleave`, `dragover`, `drop`, `dragstart`
- **Other events**: `wheel`, `scroll`, `resize`, `contextmenu`, `select`

For more details, see the [Canvas Engine DOMContainer documentation](https://canvasengine.net/components/dom-container.html#supported-events).
