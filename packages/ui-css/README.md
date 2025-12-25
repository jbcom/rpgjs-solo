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

#### Core Components
- `.rpg-ui-panel` - Panel container with bevel effects and shadows
- `.rpg-ui-btn` - Interactive button with hover and active states
- `.rpg-ui-dialog` - Dialog box with speaker labels and portrait support
- `.rpg-ui-bar` - Progress/health bar with gradient fills and animations
- `.rpg-ui-bar-fill` - Fill element for bars
- `.rpg-ui-bar-label` - Text overlay for bars
- `.rpg-ui-menu` - Menu container with selection indicators
- `.rpg-ui-menu-item` - Individual menu items with hover effects
- `.rpg-ui-menu-header` - Menu header section

#### RPG-Specific Components
- `.rpg-ui-inventory` - Inventory grid container
- `.rpg-ui-inventory-slot` - Individual inventory slot with rarity indicators
- `.rpg-ui-inventory-slot-icon` - Icon container for inventory items
- `.rpg-ui-inventory-slot-quantity` - Item quantity display
- `.rpg-ui-inventory-slot-rarity` - Rarity color indicator (common, uncommon, rare, epic, legendary)
- `.rpg-ui-stats` - Stats container
- `.rpg-ui-stat` - Individual stat display
- `.rpg-ui-stat-label` - Stat label text
- `.rpg-ui-stat-value` - Stat value with change indicators
- `.rpg-ui-stat-change` - Positive/negative stat change indicator
- `.rpg-ui-stat-group` - Group of related stats
- `.rpg-ui-stat-group-title` - Group title
- `.rpg-ui-stat-grid` - Grid layout for stats
- `.rpg-ui-stat-bar-container` - Container for stat with bar
- `.rpg-ui-character-card` - Character profile card
- `.rpg-ui-character-card-header` - Card header section
- `.rpg-ui-character-card-avatar` - Character avatar/portrait
- `.rpg-ui-character-card-info` - Character info section
- `.rpg-ui-character-card-name` - Character name
- `.rpg-ui-character-card-class` - Character class/race
- `.rpg-ui-character-card-level` - Character level badge
- `.rpg-ui-character-card-stats` - Stats section in card
- `.rpg-ui-character-card-section` - Card section divider
- `.rpg-ui-character-card-section-title` - Section title

### Variants & States

#### Button Variants
```html
<button class="rpg-ui-btn" data-variant="primary">Primary</button>
<button class="rpg-ui-btn" data-variant="success">Success</button>
<button class="rpg-ui-btn" data-variant="warning">Warning</button>
<button class="rpg-ui-btn" data-variant="danger">Danger</button>
```

#### Bar Types
```html
<div class="rpg-ui-bar" data-type="health">Health Bar</div>
<div class="rpg-ui-bar" data-type="mana">Mana Bar</div>
<div class="rpg-ui-bar" data-type="stamina">Stamina Bar</div>
<div class="rpg-ui-bar" data-type="experience">Experience Bar</div>
```

#### Menu Selection
```html
<div class="rpg-ui-menu-item" data-selected="true">Selected Item</div>
```

#### Inventory Slot States
```html
<div class="rpg-ui-inventory-slot" data-selected="true">Selected Slot</div>
<div class="rpg-ui-inventory-slot" data-locked="true">Locked Slot</div>
<div class="rpg-ui-inventory-slot-rarity" data-rarity="legendary"></div>
```

## CSS Custom Properties (Tokens)

All styling is controlled via CSS custom properties:

```css
:root {
  /* Colors */
  --rpg-ui-bg: #1c1917;
  --rpg-ui-surface: #292524;
  --rpg-ui-border: #d6b36a;
  --rpg-ui-border-light: #fde047;
  --rpg-ui-border-dark: #78350f;
  --rpg-ui-text: #fef3c7;
  --rpg-ui-text-muted: #a8a29e;
  --rpg-ui-accent: #f59e0b;
  --rpg-ui-success: #22c55e;
  --rpg-ui-warning: #eab308;
  --rpg-ui-danger: #dc2626;
  --rpg-ui-info: #3b82f6;

  /* Gradients */
  --rpg-ui-gradient-surface: linear-gradient(180deg, var(--rpg-ui-surface), var(--rpg-ui-bg));
  --rpg-ui-gradient-accent: linear-gradient(180deg, var(--rpg-ui-accent), color-mix(in srgb, var(--rpg-ui-accent), black 20%));
  --rpg-ui-gradient-bar: linear-gradient(90deg, var(--rpg-ui-accent), color-mix(in srgb, var(--rpg-ui-accent), black 30%));

  /* Shadows */
  --rpg-ui-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.5);
  --rpg-ui-shadow-md: 0 4px 6px rgba(0, 0, 0, 0.6);
  --rpg-ui-shadow-lg: 0 10px 25px rgba(0, 0, 0, 0.8);
  --rpg-ui-shadow-glow: 0 0 20px var(--rpg-ui-accent);
  --rpg-ui-shadow-inset: inset 0 1px 3px rgba(0, 0, 0, 0.5);

  /* Typography */
  --rpg-ui-font: "Cinzel", serif;
  --rpg-ui-font-size: 1rem;
  --rpg-ui-font-size-sm: 0.875rem;
  --rpg-ui-font-size-lg: 1.125rem;
  --rpg-ui-font-weight: 600;
  --rpg-ui-font-weight-bold: 800;
  --rpg-ui-text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);

  /* Layout */
  --rpg-ui-radius-sm: 4px;
  --rpg-ui-radius-md: 6px;
  --rpg-ui-radius-lg: 10px;
  --rpg-ui-border-width: 3px;
  --rpg-ui-spacing: 0.75rem;
  --rpg-ui-spacing-lg: 1.25rem;

  /* Effects */
  --rpg-ui-bevel-light: var(--rpg-ui-border-light);
  --rpg-ui-bevel-dark: var(--rpg-ui-border-dark);
  --rpg-ui-border-double: 4px;
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

### Character Card with Stats

```html
<div class="rpg-ui-character-card">
  <div class="rpg-ui-character-card-header">
    <div class="rpg-ui-character-card-avatar">🧙</div>
    <div class="rpg-ui-character-card-info">
      <div class="rpg-ui-character-card-name">Aelindor</div>
      <div class="rpg-ui-character-card-class">Archmage <span class="rpg-ui-character-card-level">Lv. 47</span></div>
    </div>
  </div>
  <div class="rpg-ui-character-card-stats">
    <div class="rpg-ui-stat-bar-container">
      <span class="rpg-ui-stat-label">HP</span>
      <div class="rpg-ui-bar" data-type="health">
        <div class="rpg-ui-bar-fill" style="width: 75%;"></div>
        <span class="rpg-ui-bar-label">2450/3267</span>
      </div>
      <span class="rpg-ui-stat-value">75%</span>
    </div>
  </div>
</div>
```

### Inventory System

```html
<div class="rpg-ui-inventory" style="display: grid; grid-template-columns: repeat(4, 64px);">
  <div class="rpg-ui-inventory-slot" data-selected="true">
    <div class="rpg-ui-inventory-slot-icon">⚔️</div>
    <span class="rpg-ui-inventory-slot-quantity">1</span>
    <div class="rpg-ui-inventory-slot-rarity" data-rarity="legendary"></div>
  </div>
  <div class="rpg-ui-inventory-slot">
    <div class="rpg-ui-inventory-slot-icon">🧪</div>
    <span class="rpg-ui-inventory-slot-quantity">15</span>
    <div class="rpg-ui-inventory-slot-rarity" data-rarity="uncommon"></div>
  </div>
</div>
```

### Dialog Box

```html
<div class="rpg-ui-dialog">
  <div class="rpg-ui-dialog-speaker">Ancient Sage</div>
  <div class="rpg-ui-dialog-content">
    The ancient prophecy speaks of a hero who will wield the Crystal of Eternity.
  </div>
  <div class="rpg-ui-dialog-indicator"></div>
</div>
```

### Stats Display

```html
<div class="rpg-ui-stats">
  <div class="rpg-ui-stat">
    <span class="rpg-ui-stat-label">Strength</span>
    <span class="rpg-ui-stat-value">85 <span class="rpg-ui-stat-change" data-type="positive">+5</span></span>
  </div>
  <div class="rpg-ui-stat">
    <span class="rpg-ui-stat-label">Intelligence</span>
    <span class="rpg-ui-stat-value">142 <span class="rpg-ui-stat-change" data-type="positive">+12</span></span>
  </div>
</div>
```

## Architecture

- **CSS-only**: No JavaScript dependencies
- **Framework-agnostic**: Works with any framework or plain HTML
- **Token-based**: All styling via CSS custom properties
- **Gaming-focused**: Designed for 2D RPG games with authentic UI elements
- **RPG components**: Character cards, inventory, stats, dialog boxes, menus
- **Visual effects**: Bevel edges, gradients, shadows, glow effects, animations
- **Minimal defaults**: Default theme is optional
- **Fully customizable**: Override tokens for complete theming

## Features

- 🎮 **Authentic RPG styling**: Medieval-themed default theme
- ⚔️ **Character cards**: Complete character profile with stats and vitals
- 📦 **Inventory system**: Slots with rarity indicators and selection states
- 💪 **Stats display**: Individual stats with positive/negative change indicators
- 💬 **Dialog boxes**: Speaker labels, portrait support, and navigation indicators
- 📊 **Progress bars**: Health, mana, stamina, experience with gradient fills and animations
- 🎨 **Button variants**: Primary, success, warning, danger with hover/active states
- 📋 **Menu system**: Selection indicators, hover effects, and animations
- 🎯 **Bevel effects**: 3D-style borders with light/dark edge highlighting
- ✨ **Glow effects**: Subtle glows on hover and selection
- 🔧 **Full customization**: Every aspect is configurable via CSS tokens