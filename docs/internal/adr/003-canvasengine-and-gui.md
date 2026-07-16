# ADR 003: CanvasEngine and GUI Boundaries

- Status: Proposed
- Target: RPGJS v5 stable

## Context

RPGJS v4 made extensive use of DOM frameworks for GUI. RPGJS v5 uses
CanvasEngine as the default game rendering and component environment while
retaining Vue for appropriate DOM integrations. Gameplay commands must not
depend on one visual implementation.

## Proposed decision

- CanvasEngine is the official v5 renderer and component contract for `.ce` game components.
- PixiJS details remain implementation details unless explicitly documented.
- player-facing gameplay commands operate through renderer-neutral GUI contracts.
- Vue remains an official stable integration for DOM overlays and low-level RPG UI building blocks.
- feature-specific UI belongs to its feature module and exposes replaceable components or slots.
- `@rpgjs/ui-css` defines the DOM styling and theming contract independently of gameplay behavior.

## Consequences

- dialog, choice, menu, save/load, notification, and chat behavior can be restyled or replaced
- CanvasEngine components must not acquire server gameplay authority
- feature modules ship default UI without forcing that UI on games
- theme packages can change appearance without copying component behavior

## Validation

- at least one gameplay GUI command is rendered by two different UI implementations
- chat behavior runs with its default component and a replacement component
- default and alternate CSS themes use the same DOM component markup
- server bundle tests reject CanvasEngine client components
