# Pressure Plate Playground

This demo shows generic event touch hooks and map variables:

- `Plate.onTouch` opens the door when the stone enters the plate.
- `Plate.onTouchEnd` closes the door when the stone leaves.
- `Door.onChanges` reads the shared map variable and updates collision.

Run it directly:

```bash
pnpm --dir playground dev:pressure-plate
```
