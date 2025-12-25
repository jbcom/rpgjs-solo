# @rpgjs/ui-css

A framework-agnostic CSS library for RPG UI components. Fully customizable via CSS custom properties.

## Installation

```bash
npm install @rpgjs/ui-css
# or
pnpm add @rpgjs/ui-css
```

## Usage

### Basic Setup

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="@rpgjs/ui-css/reset.css">
  <link rel="stylesheet" href="@rpgjs/ui-css/index.css">
  <link rel="stylesheet" href="@rpgjs/ui-css/theme-default.css">
</head>
<body>
  <!-- Your RPG UI here -->
</body>
</html>
```

### With Build Tools

```javascript
// In your CSS/SCSS
@import '@rpgjs/ui-css/reset.css';
@import '@rpgjs/ui-css/index.css';
@import '@rpgjs/ui-css/theme-default.css';
```

## Components

### Primitives

- `.rpg-ui-panel` - Basic container with background and border
- `.rpg-ui-btn` - Interactive button
- `.rpg-ui-dialog` - Modal-style container
- `.rpg-ui-bar` - Progress/health bar container
- `.rpg-ui-bar-fill` - Fill element for bars
- `.rpg-ui-menu` - Menu container
- `.rpg-ui-menu-item` - Individual menu items

### Variants & States

Use `data-variant` and `data-state` attributes:

```html
<button class="rpg-ui-btn" data-variant="primary">Primary Button</button>
```

## CSS Custom Properties (Tokens)

All styling is controlled via CSS custom properties:

```css
:root {
  /* Colors */
  --rpg-ui-bg: #1c1917;
  --rpg-ui-surface: #292524;
  --rpg-ui-border: #d6b36a;
  --rpg-ui-text: #fef3c7;
  --rpg-ui-accent: #f59e0b;

  /* Typography */
  --rpg-ui-font: "Cinzel", serif;
  --rpg-ui-font-size: 1rem;

  /* Layout */
  --rpg-ui-radius-sm: 4px;
  --rpg-ui-radius-lg: 8px;
  --rpg-ui-border-width: 2px;
  --rpg-ui-spacing: 0.5rem;
}
```

## Creating Custom Themes

### Override Globally

```css
:root {
  --rpg-ui-accent: hotpink;
  --rpg-ui-font: "Arial", sans-serif;
}
```

### Override Locally

```css
.my-custom-ui {
  --rpg-ui-accent: hotpink;
  --rpg-ui-radius-lg: 0;
}
```

### Custom Theme File

```css
/* my-theme.css */
:root {
  --rpg-ui-bg: #2d1b69;
  --rpg-ui-surface: #4c2a85;
  --rpg-ui-border: #ff6b6b;
  --rpg-ui-text: #ffffff;
  --rpg-ui-accent: #ffd93d;
  --rpg-ui-font: "MedievalSharp", cursive;
}
```

## Example

```html
<div class="rpg-ui-panel">
  <h2>Character Stats</h2>
  <div class="rpg-ui-bar">
    <div class="rpg-ui-bar-fill" style="width: 75%"></div>
  </div>
  <button class="rpg-ui-btn" data-variant="primary">Level Up</button>
</div>

<div class="rpg-ui-menu">
  <div class="rpg-ui-menu-item">New Game</div>
  <div class="rpg-ui-menu-item">Load Game</div>
  <div class="rpg-ui-menu-item">Settings</div>
</div>

<div class="rpg-ui-dialog">
  <p>Are you sure you want to quit?</p>
  <button class="rpg-ui-btn">Yes</button>
  <button class="rpg-ui-btn">No</button>
</div>
```

## Architecture

- **CSS-only**: No JavaScript dependencies
- **Framework-agnostic**: Works with any framework or plain HTML
- **Token-based**: All styling via CSS custom properties
- **Minimal defaults**: Default theme is optional
- **Fully customizable**: Override tokens for complete theming