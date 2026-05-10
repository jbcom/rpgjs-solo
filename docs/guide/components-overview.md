---
title: "Components overview"
description: "Choose the right RPGJS component system for sprites, server-controlled visuals, and prebuilt effects."
---

# Components overview

RPGJS has several component systems. They all render visual elements, but they do not have the same owner or lifecycle.

Use this page to choose the right one before creating a `.ce` component or a server-controlled sprite display.

## Choose a component type

| Need | Use |
| --- | --- |
| Add a visual effect to every matching sprite from the client | [Sprite Components](/guide/sprite-components) |
| Display player-specific visuals decided by the server | [Authoritative Sprite Components](/guide/component) |
| Reuse an RPGJS-provided visual effect | [Prebuilt Components](/guide/prebuilt-components/index) |
| Show an interactive interface that opens, closes, or sends actions | [GUI](/gui/index) |
| Show an interface that follows a sprite and is controlled like a GUI | [Attach GUI to Sprites](/guide/gui/attach-gui) |

## Sprite components

Sprite components are client-side CanvasEngine components attached to sprite rendering. Use them for visual layers such as shadows, auras, simple status indicators, or other effects that should render behind or in front of sprites.

They are configured from the client module with `componentsBehind` and `componentsInFront`.

## Authoritative sprite components

Authoritative sprite components are controlled by the server. Use them when the server must decide what appears around a player, such as a name tag, HP bar, badge, or server-driven status marker.

They are configured from server gameplay code with methods such as `setComponentsTop()`, `setComponentsBottom()`, and `removeComponents()`.

## Prebuilt components

Prebuilt components are ready-to-use components shipped by RPGJS. Use them when an existing component matches the visual effect you need before creating a custom `.ce` component.

## GUI is separate

GUI components are application interfaces, not sprite render layers. Use GUI pages for menus, dialogs, HUDs, title screens, Vue integration, optimistic actions, and GUI components attached to sprites.

Start with [GUI overview](/gui/index) when the component should behave like an interface rather than a passive sprite visual.
